package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type QueryRequest struct {
	SQL string `json:"sql"`
}

func main() {
	// Default connection string from user metadata
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Default to local docker database
		connStr = "postgresql://postgres:postgres@127.0.0.1:5433/myapp"
	}

	fmt.Printf("Connecting to database: %s\n", connStr)

	db, err := sql.Open("pgx", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	http.HandleFunc("/query", func(w http.ResponseWriter, r *http.Request) {
		// Log the request
		fmt.Printf("Received request: %s %s\n", r.Method, r.URL.Path)

		// CORS
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			fmt.Println("Handling OPTIONS request")
			return
		}

		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req QueryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Basic safety check - in a real app this would be much more robust
		// For this task, we just execute what is given as requested.

		fmt.Println("Executing query:", req.SQL)
		rows, err := db.Query(req.SQL)
		if err != nil {
			fmt.Println("Query execution failed:", err)
			// Return database errors clearly to the frontend
			http.Error(w, fmt.Sprintf("Database Error: %v", err), http.StatusInternalServerError)
			return
		}
		fmt.Println("Query executed successfully")
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			fmt.Println("Failed to get columns:", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var result []map[string]interface{}

		fmt.Println("Scanning rows...")
		rowCount := 0
		for rows.Next() {
			rowCount++
			columns := make([]interface{}, len(cols))
			columnPointers := make([]interface{}, len(cols))
			for i := range columns {
				columnPointers[i] = &columns[i]
			}

			if err := rows.Scan(columnPointers...); err != nil {
				fmt.Println("Scan failed:", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			m := make(map[string]interface{})
			for i, colName := range cols {
				val := columnPointers[i].(*interface{})
				// Handle byte arrays (common for text in some drivers)
				if b, ok := (*val).([]byte); ok {
					m[colName] = string(b)
				} else {
					m[colName] = *val
				}
			}
			result = append(result, m)
		}
		fmt.Printf("Scanned %d rows\n", rowCount)

		w.Header().Set("Content-Type", "application/json")
		// If result is nil (no rows), return empty array
		if result == nil {
			result = []map[string]interface{}{}
		}
		json.NewEncoder(w).Encode(result)
	})

	fmt.Println("Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
