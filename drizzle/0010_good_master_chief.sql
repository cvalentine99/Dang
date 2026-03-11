CREATE TABLE `connection_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(64) NOT NULL,
	`settingKey` varchar(64) NOT NULL,
	`settingValue` text NOT NULL,
	`isEncrypted` int NOT NULL DEFAULT 0,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connection_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cs_category_key_idx` ON `connection_settings` (`category`,`settingKey`);