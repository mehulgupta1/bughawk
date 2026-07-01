// admin.chunk.js — lazy-loaded admin module (fake creds, safe for testing)
import { http } from "./http.js";

export const ADMIN_API = "https://admin-api.example.com/internal/v1";

// JWT left in source (decodes to a fake payload)
const SERVICE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdmMtYWRtaW4iLCJyb2xlIjoic3VwZXJhZG1pbiIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

// DB connection strings
const PG = "postgres://admin:s3cr3tP%40ss@db.internal.example.com:5432/prod";
const MONGO = "mongodb+srv://root:rootpw@cluster0.abcde.mongodb.net/app?retryWrites=true";
const REDIS = "redis://:authpass@cache.internal.example.com:6379/0";

// Twilio + SendGrid
const TWILIO_SID = "AC" + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const TWILIO_TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const SENDGRID = "SG.aB3xZ9kLm2QpR7sT4uV6wY.8nC1dE5fG0hJ2kL4mN6pQ8rS0tU2vW4xY6zA8b";

const ENDPOINTS = [
  "/internal/v1/users/impersonate",
  "/internal/v1/secrets/rotate",
  "/internal/v1/feature-flags",
  "/api/admin/sql?query=SELECT+*+FROM+users",
  "/api/admin/export?format=csv&table=payments",
  "/.git/config",
  "/.env.production",
  "/config/credentials.yml",
  "/password/reset?token=RESET123&uid=1"
];

export async function impersonate(userId) {
  return http.post(ADMIN_API + "/users/impersonate", { userId }, {
    headers: { Authorization: "Bearer " + SERVICE_JWT }
  });
}

export async function dumpTable(table) {
  return http.get(`${ADMIN_API}/export?table=${table}&token=${SERVICE_JWT}`);
}

export const _conns = { PG, MONGO, REDIS, TWILIO_SID, TWILIO_TOKEN, SENDGRID, ENDPOINTS };
