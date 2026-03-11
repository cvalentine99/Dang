ALTER TABLE `analyst_notes` MODIFY COLUMN `content` text NOT NULL;--> statement-breakpoint
ALTER TABLE `analyst_notes` MODIFY COLUMN `tags` json;