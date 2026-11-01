-- CreateTable
CREATE TABLE "teachers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "kiosks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "firmware" TEXT NOT NULL,
    "last_seen" DATETIME
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kiosk_id" INTEGER NOT NULL,
    "teacher_id" INTEGER NOT NULL,
    "activity_type" TEXT NOT NULL,
    "activity_subtype" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "safety_level" TEXT NOT NULL,
    "languages" TEXT NOT NULL,
    "blocked_words" TEXT NOT NULL DEFAULT '[]',
    "allowed_words" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "sessions_kiosk_id_fkey" FOREIGN KEY ("kiosk_id") REFERENCES "kiosks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_id" INTEGER NOT NULL,
    "queue_number" INTEGER NOT NULL,
    "original_speech" TEXT NOT NULL,
    "recognized_text" TEXT NOT NULL,
    "language" TEXT,
    "final_prompt" TEXT,
    "status" TEXT NOT NULL,
    "block_category" TEXT,
    "block_reason" TEXT,
    "block_match" TEXT,
    "block_source" TEXT,
    "moderation_status" TEXT,
    "moderated_at" DATETIME,
    "moderated_by" INTEGER,
    "label_en" TEXT,
    "label_fil" TEXT,
    "image_file" TEXT,
    "image_provider" TEXT,
    "generated_at" DATETIME,
    "sheet" TEXT,
    "print_status" TEXT NOT NULL DEFAULT 'not_printed',
    "printed_at" DATETIME,
    "print_error" TEXT,
    "reprint_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "requests_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "teachers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "teacher_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "events_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "teachers_username_key" ON "teachers"("username");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "requests_session_id_idx" ON "requests"("session_id");

-- CreateIndex
CREATE INDEX "requests_created_at_idx" ON "requests"("created_at");

-- CreateIndex
CREATE INDEX "requests_moderation_status_idx" ON "requests"("moderation_status");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");
