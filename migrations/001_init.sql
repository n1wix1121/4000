CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    full_name TEXT,
    phone TEXT UNIQUE,
    birth_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_types (
    id SERIAL PRIMARY KEY,
    name TEXT,
    price INT,
    duration_days INT,
    visits_count INT
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    client_id INT REFERENCES clients(id),
    type_id INT REFERENCES subscription_types(id),
    sale_date DATE DEFAULT CURRENT_DATE,
    start_date DATE,
    end_date DATE,
    remaining_visits INT,
    price INT
);

CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    client_id INT REFERENCES clients(id),
    sub_id INT REFERENCES subscriptions(id),
    visit_date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE,
    executed_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO subscription_types (name, price, duration_days, visits_count) VALUES 
('Разовое', 500, 1, 1),
('4 занятия', 1500, NULL, 4),
('8 занятий', 2500, NULL, 8),
('Месячный', 2000, 30, NULL),
('Годовой', 15000, 365, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO clients (full_name, phone, birth_date) VALUES 
('Тарасова Анна Романовна', '+89001234567', '2000-01-01')
ON CONFLICT (phone) DO NOTHING;