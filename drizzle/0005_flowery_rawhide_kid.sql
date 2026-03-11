CREATE TABLE `analyst_notes_v2` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`entityType` enum('alert','agent','cve','rule','general') NOT NULL,
	`entityId` varchar(128) NOT NULL DEFAULT '',
	`title` varchar(512) NOT NULL,
	`content` text NOT NULL,
	`severity` enum('critical','high','medium','low','info') NOT NULL DEFAULT 'info',
	`tags` json,
	`resolved` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analyst_notes_v2_id` PRIMARY KEY(`id`)
);
