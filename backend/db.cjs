const path = require("node:path");
const { Pool } = require("pg");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 5000,
});

module.exports = pool;