CREATE INDEX `notes_v2_userId_idx` ON `analyst_notes_v2` (`userId`);--> statement-breakpoint
CREATE INDEX `notes_v2_entityType_idx` ON `analyst_notes_v2` (`entityType`);--> statement-breakpoint
CREATE INDEX `notes_v2_entityId_idx` ON `analyst_notes_v2` (`entityId`);--> statement-breakpoint
CREATE INDEX `notes_v2_entity_lookup_idx` ON `analyst_notes_v2` (`entityType`,`entityId`);