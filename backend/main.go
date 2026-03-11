package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/fsnotify/fsnotify"
	_ "modernc.org/sqlite"
)

type Note struct {
	ID        int      `json:"id"`
	Title     string   `json:"title"`
	Content   string   `json:"content"`
	Tags      []string `json:"tags"`
	UpdatedAt string   `json:"updatedAt"`
}

type GroupedNote struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Tag   string `json:"tag"`
}

var db *sql.DB
var watcher *fsnotify.Watcher
var watchedFiles = make(map[string]bool)
var watchMu sync.Mutex

type FileUpdateEvent struct {
	Type    string `json:"type"`
	Path    string `json:"path"`
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

func main() {
	port := flag.Int("port", 8080, "Port to run the HTTP server on")
	dbPath := flag.String("dbpath", "notes.db", "Path to the SQLite database file")
	flag.Parse()

	var err error
	db, err = sql.Open("sqlite", *dbPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	initDB()
	initWatcher()

	http.HandleFunc("/notes", handleNotes)
	http.HandleFunc("/notes/grouped", handleGroupedNotes)
	http.HandleFunc("/notes/rename-tag", handleRenameTag)
	http.HandleFunc("/notes/update-tags", handleUpdateNoteTags)
	http.HandleFunc("/file", handleFile)
	http.HandleFunc("/watch", handleWatch)
	http.HandleFunc("/unwatch", handleUnwatch)

	fmt.Printf("Starting server on port %d...\n", *port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", *port), nil))
}

func initWatcher() {
	var err error
	watcher, err = fsnotify.NewWatcher()
	if err != nil {
		log.Fatal("Failed to create file watcher:", err)
	}

	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Has(fsnotify.Write) {
					// File was modified, push update
					content, err := os.ReadFile(event.Name)
					var update FileUpdateEvent
					if err != nil {
						update = FileUpdateEvent{Type: "file_error", Path: event.Name, Error: err.Error()}
					} else {
						update = FileUpdateEvent{Type: "file_update", Path: event.Name, Content: string(content)}
					}
					msg, _ := json.Marshal(update)
					fmt.Printf("EVENT:%s\n", string(msg))
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("Watcher error:", err)
			}
		}
	}()
}

func handleFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Write(content)
}

func handleWatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	watchMu.Lock()
	defer watchMu.Unlock()

	if !watchedFiles[req.Path] {
		err := watcher.Add(req.Path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		watchedFiles[req.Path] = true
	}

	w.WriteHeader(http.StatusOK)
}

func handleUnwatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	watchMu.Lock()
	defer watchMu.Unlock()

	if watchedFiles[req.Path] {
		watcher.Remove(req.Path)
		delete(watchedFiles, req.Path)
	}

	w.WriteHeader(http.StatusOK)
}

func initDB() {
	// Base notes table
	createTableSQL := `CREATE TABLE IF NOT EXISTS notes (
		"id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		"title" TEXT,
		"content" TEXT,
		"tags" TEXT,
		"updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	_, err := db.Exec(createTableSQL)
	if err != nil {
		log.Fatal("Failed to create table:", err)
	}

	// FTS5 Virtual Table
	createFTSSQL := `CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(
		title,
		content,
		content='notes',
		content_rowid='id'
	);`
	_, err = db.Exec(createFTSSQL)
	if err != nil {
		log.Fatal("Failed to create FTS table:", err)
	}

	// Triggers to keep FTS in sync
	triggers := []string{
		`CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
			INSERT INTO fts_notes(rowid, title, content) VALUES (new.id, new.title, new.content);
		END;`,
		`CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
			INSERT INTO fts_notes(fts_notes, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
		END;`,
		`CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
			INSERT INTO fts_notes(fts_notes, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
			INSERT INTO fts_notes(rowid, title, content) VALUES (new.id, new.title, new.content);
		END;`,
	}

	for _, trigger := range triggers {
		_, err = db.Exec(trigger)
		if err != nil {
			log.Fatal("Failed to create trigger:", err)
		}
	}

	// Backfill FTS index for existing notes
	backfillSQL := `INSERT INTO fts_notes(rowid, title, content) 
	               SELECT id, title, content FROM notes 
	               WHERE id NOT IN (SELECT rowid FROM fts_notes);`
	_, err = db.Exec(backfillSQL)
	if err != nil {
		log.Println("Note: FTS backfill warning (may already be synced):", err)
	}
}

func handleNotes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		query := r.URL.Query().Get("q")
		if query != "" {
			notes := searchNotes(query)
			json.NewEncoder(w).Encode(notes)
			return
		}
		notes := getNotes()
		json.NewEncoder(w).Encode(notes)
	case "POST":
		var note Note
		err := json.NewDecoder(r.Body).Decode(&note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		savedNote := saveNote(note)
		json.NewEncoder(w).Encode(savedNote)
	case "DELETE":
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			http.Error(w, "ID is required", http.StatusBadRequest)
			return
		}
		var id int
		fmt.Sscanf(idStr, "%d", &id)
		err := deleteNote(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func deleteNote(id int) error {
	_, err := db.Exec("DELETE FROM notes WHERE id = ?", id)
	if err != nil {
		log.Println("Error deleting note:", err)
		return err
	}
	return nil
}

func getNotes() []Note {
	rows, err := db.Query("SELECT id, title, content, tags, updated_at FROM notes ORDER BY updated_at DESC")
	if err != nil {
		log.Println("Error querying notes:", err)
		return []Note{}
	}
	defer rows.Close()

	var notes []Note
	for rows.Next() {
		var n Note
		var tagsJSON string
		var updatedAt string
		err = rows.Scan(&n.ID, &n.Title, &n.Content, &tagsJSON, &updatedAt)
		if err != nil {
			log.Println("Error scanning note:", err)
			continue
		}
		
		json.Unmarshal([]byte(tagsJSON), &n.Tags)
		if n.Tags == nil {
			n.Tags = []string{}
		}
		n.UpdatedAt = updatedAt
		notes = append(notes, n)
	}
	
	if notes == nil {
		notes = []Note{}
	}
	
	return notes
}

func saveNote(n Note) Note {
	tagsJSON, _ := json.Marshal(n.Tags)
	if len(n.Tags) == 0 {
		tagsJSON = []byte("[]")
	}

	if n.ID == 0 {
		// Insert
		res, err := db.Exec("INSERT INTO notes (title, content, tags, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)", n.Title, n.Content, string(tagsJSON))
		if err != nil {
			log.Println("Error inserting note:", err)
			return n
		}
		id, _ := res.LastInsertId()
		n.ID = int(id)
	} else {
		// Update
		_, err := db.Exec("UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", n.Title, n.Content, string(tagsJSON), n.ID)
		if err != nil {
			log.Println("Error updating note:", err)
		}
	}
	
	// Fetch correct updated_at
	err := db.QueryRow("SELECT updated_at FROM notes WHERE id = ?", n.ID).Scan(&n.UpdatedAt)
	if err != nil {
		log.Println("Error getting updated_at:", err)
	}

	return n
}

type SearchResult struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	Snippet string `json:"snippet"`
}

func searchNotes(query string) []SearchResult {
	// Use SQLite FTS5 snippet for highlighting
	searchSQL := `SELECT notes.id, notes.title, snippet(fts_notes, 1, '<mark>', '</mark>', '...', 20) 
	              FROM notes 
	              JOIN fts_notes ON notes.id = fts_notes.rowid 
	              WHERE fts_notes MATCH ? 
	              ORDER BY rank LIMIT 10`

	rows, err := db.Query(searchSQL, query+"*") // Prefix search
	if err != nil {
		log.Println("Error searching notes:", err)
		return []SearchResult{}
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		err = rows.Scan(&r.ID, &r.Title, &r.Snippet)
		if err != nil {
			log.Println("Error scanning search result:", err)
			continue
		}
		results = append(results, r)
	}

	if results == nil {
		results = []SearchResult{}
	}

	return results
}
func handleGroupedNotes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "GET" {
		http.Error(w, "Method not supported", http.StatusMethodNotAllowed)
		return
	}
	grouped := getGroupedNotes()
	json.NewEncoder(w).Encode(grouped)
}

func getGroupedNotes() []GroupedNote {
	// Highly optimized query using json_each to flatten tags
	// notes without tags are returned with tag as NULL/empty
	query := `
		SELECT n.id, n.title, CASE WHEN jt.value IS NULL THEN 'Untagged' ELSE jt.value END as tag
		FROM notes n
		LEFT JOIN json_each(n.tags) jt
		ORDER BY tag ASC, n.updated_at DESC
	`
	rows, err := db.Query(query)
	if err != nil {
		log.Println("Error querying grouped notes:", err)
		return []GroupedNote{}
	}
	defer rows.Close()

	var results []GroupedNote
	for rows.Next() {
		var gn GroupedNote
		if err := rows.Scan(&gn.ID, &gn.Title, &gn.Tag); err != nil {
			log.Println("Error scanning grouped note:", err)
			continue
		}
		results = append(results, gn)
	}
	return results
}
func handleRenameTag(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		OldName string `json:"oldName"`
		NewName string `json:"newName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.OldName == "" || req.NewName == "" {
		http.Error(w, "Both old and new tag names are required", http.StatusBadRequest)
		return
	}

	err := renameTag(req.OldName, req.NewName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func renameTag(oldTag, newTag string) error {
	// Find all notes that have the old tag
	rows, err := db.Query("SELECT id, tags FROM notes WHERE tags LIKE ?", "%"+oldTag+"%")
	if err != nil {
		return err
	}
	defer rows.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for rows.Next() {
		var id int
		var tagsJSON string
		if err := rows.Scan(&id, &tagsJSON); err != nil {
			continue
		}

		var tags []string
		json.Unmarshal([]byte(tagsJSON), &tags)

		found := false
		for i, t := range tags {
			if t == oldTag {
				tags[i] = newTag
				found = true
			}
		}

		if found {
			newTagsJSON, _ := json.Marshal(tags)
			_, err = tx.Exec("UPDATE notes SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", string(newTagsJSON), id)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func handleUpdateNoteTags(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID   int      `json:"id"`
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tagsJSON, _ := json.Marshal(req.Tags)
	_, err := db.Exec("UPDATE notes SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", string(tagsJSON), req.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
