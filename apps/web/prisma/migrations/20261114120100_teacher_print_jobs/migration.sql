-- CreateTable
CREATE TABLE "print_jobs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT,
    "file_type" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL DEFAULT 1,
    "page_range" TEXT NOT NULL DEFAULT 'all',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sheets_done" INTEGER NOT NULL DEFAULT 0,
    "sheets_total" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER NOT NULL,
    "kiosk_id" INTEGER,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" DATETIME,
    CONSTRAINT "print_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "teachers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_jobs_kiosk_id_fkey" FOREIGN KEY ("kiosk_id") REFERENCES "kiosks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");

-- CreateIndex
CREATE INDEX "print_jobs_created_at_idx" ON "print_jobs"("created_at");
