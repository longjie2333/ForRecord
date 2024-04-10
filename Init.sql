CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    title TEXT,
    content TEXT,
    createon TEXT,
    comments TEXT 
);

INSERT INTO notes (title, content, createon) VALUES ('README', '首页内容', '2024-04-09')