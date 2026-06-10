#!/usr/bin/env python3
import io
import json
import os
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from pypdf import PdfReader


MAX_UPLOAD_BYTES = 20 * 1024 * 1024
DATA_DIR = Path(os.environ.get("DATA_DIR", ".")).resolve()
DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "roster.sqlite3")).resolve()
PILOT_TOKEN = os.environ.get("PILOT_TOKEN", "change-me")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")


def db():
  DATA_DIR.mkdir(parents=True, exist_ok=True)
  connection = sqlite3.connect(DATABASE_PATH)
  connection.execute("""
    CREATE TABLE IF NOT EXISTS rosters (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  """)
  return connection


def read_json_body(handler):
  length = int(handler.headers.get("Content-Length", "0") or "0")
  if length <= 0:
    return {}
  return json.loads(handler.rfile.read(length).decode("utf-8"))


class RosterAPIHandler(BaseHTTPRequestHandler):
  def do_OPTIONS(self):
    self.send_response(204)
    self.cors()
    self.end_headers()

  def do_GET(self):
    path = urlparse(self.path).path
    if path == "/api/health":
      self.send_json({"ok": True})
      return
    if path == "/api/roster/public":
      self.get_public_roster()
      return
    self.send_json({"error": "Endpoint nao encontrado."}, status=404)

  def do_POST(self):
    path = urlparse(self.path).path
    if path == "/api/auth/pilot":
      self.validate_pilot_token()
      return
    if path == "/api/extract-pdf":
      self.extract_pdf()
      return
    if path == "/api/roster":
      self.publish_roster()
      return
    self.send_json({"error": "Endpoint nao encontrado."}, status=404)

  def validate_pilot_token(self):
    if self.headers.get("X-Pilot-Token") != PILOT_TOKEN:
      self.send_json({"error": "Token do piloto invalido."}, status=401)
      return
    self.send_json({"ok": True})

  def extract_pdf(self):
    length = int(self.headers.get("Content-Length", "0") or "0")
    if length <= 0:
      self.send_json({"error": "Nenhum PDF recebido."}, status=400)
      return
    if length > MAX_UPLOAD_BYTES:
      self.send_json({"error": "PDF muito grande. Limite atual: 20 MB."}, status=413)
      return

    query = parse_qs(urlparse(self.path).query)
    filename = unquote((query.get("filename") or ["escala.pdf"])[0])
    content_type = self.headers.get("Content-Type", "")
    if "pdf" not in content_type.lower() and not filename.lower().endswith(".pdf"):
      self.send_json({"error": "Envie um arquivo PDF."}, status=400)
      return

    try:
      reader = PdfReader(io.BytesIO(self.rfile.read(length)))
      pages = []
      for page_number, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        pages.append(f"--- pagina {page_number} ---\n{page_text}")
      text = "\n".join(pages).strip()
    except Exception as exc:
      self.send_json({"error": f"Falha ao ler PDF: {exc}"}, status=422)
      return

    if not text:
      self.send_json({"error": "Nao consegui extrair texto. O PDF pode ser uma imagem/scanner; sera necessario OCR."}, status=422)
      return

    self.send_json({
      "filename": filename,
      "pages": len(reader.pages),
      "characters": len(text),
      "text": text,
    })

  def publish_roster(self):
    if self.headers.get("X-Pilot-Token") != PILOT_TOKEN:
      self.send_json({"error": "Token do piloto invalido."}, status=401)
      return

    try:
      payload = read_json_body(self)
    except Exception:
      self.send_json({"error": "JSON invalido."}, status=400)
      return

    duties = payload.get("duties")
    meta = payload.get("meta") or {}
    if not isinstance(duties, list):
      self.send_json({"error": "Payload deve conter duties como lista."}, status=400)
      return

    meta["updatedAt"] = datetime.now(timezone.utc).isoformat()
    public_payload = {"meta": meta, "duties": duties}
    with db() as connection:
      connection.execute(
        "INSERT OR REPLACE INTO rosters (id, payload, updated_at) VALUES (1, ?, ?)",
        (json.dumps(public_payload, ensure_ascii=False), meta["updatedAt"]),
      )

    self.send_json({"ok": True, "count": len(duties), "updatedAt": meta["updatedAt"]})

  def get_public_roster(self):
    with db() as connection:
      row = connection.execute("SELECT payload FROM rosters WHERE id = 1").fetchone()
    if not row:
      self.send_json({"error": "Nenhuma escala publicada."}, status=404)
      return
    self.send_json(json.loads(row[0]))

  def send_json(self, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.cors()
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def cors(self):
    self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Pilot-Token")


def main():
  port = int(os.environ.get("PORT", "4174"))
  server = ThreadingHTTPServer(("0.0.0.0", port), RosterAPIHandler)
  print(f"Serving Pilot Roster API on port {port}")
  server.serve_forever()


if __name__ == "__main__":
  main()
