CREATE TABLE `residents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`home_building_id` text,
	`work_building_id` text,
	`salary` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`home_building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_residents_home` ON `residents` (`home_building_id`);--> statement-breakpoint
CREATE INDEX `idx_residents_work` ON `residents` (`work_building_id`);