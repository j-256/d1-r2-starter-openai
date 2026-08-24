ALTER TABLE `d1_values` ADD `content_type` text DEFAULT 'text/plain; charset=utf-8' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `d1_values` (`key`, `value`, `content_type`, `updated_at`)
VALUES (
    'demo:migration',
    'Inserted by migration 0001 after content_type was added.',
    'text/plain; charset=utf-8',
    '2026-01-01T00:00:00.000Z'
);
