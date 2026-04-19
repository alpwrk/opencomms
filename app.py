from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, join_room, leave_room, emit
from tinydb import TinyDB, Query
import bcrypt, random, string, os, time

app = Flask(__name__)
app.secret_key = os.urandom(24).hex()
socketio = SocketIO(app, cors_allowed_origins="*")

db = TinyDB("db.json")
users_table = db.table("users")
rooms_table = db.table("rooms")
messages_table = db.table("messages")

User = Query()
Room = Query()
Message = Query()

def gen_room_id():
    digits = "".join(random.choices(string.digits, k=8))
    return f"cr_{digits}"

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    name = data.get("name", "").strip()
    pw   = data.get("password", "")
    if not name or not pw:
        return jsonify({"error": "Name and Password required"}), 400
    if users_table.search(User.name == name):
        return jsonify({"error": "Name already taken"}), 409
    hashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    users_table.insert({"name": name, "password": hashed})
    session["user"] = name
    return jsonify({"ok": True, "user": name})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    name = data.get("name", "").strip()
    pw   = data.get("password", "")
    res = users_table.search(User.name == name)
    if not res or not bcrypt.checkpw(pw.encode(), res[0]["password"].encode()):
        return jsonify({"error": "Invalid Credentials"}), 401
    session["user"] = name
    return jsonify({"ok": True, "user": name})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
def me():
    if "user" not in session:
        return jsonify({"user": None})
    return jsonify({"user": session["user"]})

# ── Rooms ─────────────────────────────────────────────────────────────────────

@app.route("/api/rooms", methods=["GET"])
def list_rooms():
    rooms = rooms_table.all()
    return jsonify([{"id": r["id"], "name": r["name"], "owner": r["owner"]} for r in rooms])

@app.route("/api/rooms", methods=["POST"])
def create_room():
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401
    data = request.json
    room_name = data.get("name", "").strip()
    pw        = data.get("password", "")
    if not room_name or not pw:
        return jsonify({"error": "Name and Password required"}), 400
    room_id = gen_room_id()
    while rooms_table.search(Room.id == room_id):
        room_id = gen_room_id()
    hashed = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    rooms_table.insert({"id": room_id, "name": room_name, "password": hashed, "owner": session["user"]})
    return jsonify({"ok": True, "id": room_id})

@app.route("/api/rooms/<room_id>/join", methods=["POST"])
def join_room_api(room_id):
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401
    data = request.json
    pw   = data.get("password", "")
    res  = rooms_table.search(Room.id == room_id)
    if not res:
        return jsonify({"error": "Room not found"}), 404
    room = res[0]
    if not bcrypt.checkpw(pw.encode(), room["password"].encode()):
        return jsonify({"error": "Wrong Password"}), 403
    return jsonify({"ok": True, "id": room_id, "name": room["name"]})

@app.route("/api/rooms/<room_id>/messages")
def get_messages(room_id):
    if "user" not in session:
        return jsonify({"error": "Not logged in"}), 401
    msgs = messages_table.search(Message.room == room_id)
    msgs.sort(key=lambda x: x["ts"])
    return jsonify([{"user": m["user"], "text": m["text"], "ts": m["ts"]} for m in msgs])

# ── Pages ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/room/<room_id>")
def room_page(room_id):
    return render_template("index.html")

# ── Socket.IO ─────────────────────────────────────────────────────────────────

@socketio.on("join")
def on_join(data):
    room = data.get("room")
    user = data.get("user", "anon")
    join_room(room)
    emit("system", {"text": f"{user} joined"}, to=room)

@socketio.on("leave")
def on_leave(data):
    room = data.get("room")
    user = data.get("user", "anon")
    leave_room(room)
    emit("system", {"text": f"{user} left the room"}, to=room)

@socketio.on("message")
def on_message(data):
    room = data.get("room")
    text = data.get("text", "").strip()
    user = data.get("user", "anon")
    if not text or not room:
        return
    ts = time.time()
    messages_table.insert({"room": room, "user": user, "text": text, "ts": ts})
    emit("message", {"user": user, "text": text, "ts": ts}, to=room)

if __name__ == "__main__":
    socketio.run(app, debug=True, port=5000)
