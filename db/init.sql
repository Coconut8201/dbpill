-- Create users table
CREATE TABLE users (
    userid SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    gender VARCHAR(10),
    age INT
);

-- Insert sample data
INSERT INTO users (username, gender, age) VALUES
('alice', 'female', 25),
('bob', 'male', 30),
('charlie', 'male', 28),
('diana', 'female', 26),
('evan', 'male', 32);

-- Create index on username for better query performance
CREATE INDEX idx_username ON users(username);