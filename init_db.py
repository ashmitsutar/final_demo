import sqlite3

def init_db():
    conn = sqlite3.connect("chatbot.db")
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS saved_papers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL UNIQUE,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    print("Database initialized with saved_papers table.")

if __name__ == "__main__":
    init_db()
