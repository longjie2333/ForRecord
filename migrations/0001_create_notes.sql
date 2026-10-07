CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    title TEXT,
    content TEXT,
    createon TEXT,
    comments TEXT
);

INSERT INTO notes (id, title, content, createon)
VALUES (1, 'README', '首页内容', '2024-04-09')
ON CONFLICT(id) DO NOTHING;
