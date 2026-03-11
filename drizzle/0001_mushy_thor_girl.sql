CREATE TABLE `analyst_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`content` text NOT NULL DEFAULT (''),
	`severity` enum('critical','high','medium','low','info') NOT NULL DEFAULT 'info',
	`agentId` varchar(32),
	`ruleId` varchar(32),
	`cveId` varchar(32),
	`tags` json DEFAULT ('[]'),
	`resolved` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analyst_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rag_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`contextSnapshot` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rag_sessions_id` PRIMARY KEY(`id`)
);
