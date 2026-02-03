CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activities_created_at` ON `activities` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activities_type` ON `activities` (`type`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`home_building_id` text,
	`work_building_id` text,
	`current_x` real NOT NULL,
	`current_y` real NOT NULL,
	`destination_x` real,
	`destination_y` real,
	`path` text,
	`state` text DEFAULT 'idle' NOT NULL,
	`schedule` text,
	`wallet_balance` real DEFAULT 0 NOT NULL,
	`wallet_currency` text DEFAULT 'MOLT' NOT NULL,
	`moltbook_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`home_building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agents_location` ON `agents` (`current_x`,`current_y`);--> statement-breakpoint
CREATE INDEX `idx_agents_moltbook` ON `agents` (`moltbook_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_type` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_token` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `token_blacklist` (
	`token` text PRIMARY KEY NOT NULL,
	`blacklisted_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blacklist_expires` ON `token_blacklist` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`name` text NOT NULL,
	`avatar_url` text,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`google_id` text,
	`wallet_address` text,
	`moltbook_id` text,
	`agent_id` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_google_id` ON `users` (`google_id`);--> statement-breakpoint
CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`parcel_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`sprite` text,
	`width` integer DEFAULT 1 NOT NULL,
	`height` integer DEFAULT 1 NOT NULL,
	`floors` integer DEFAULT 1 NOT NULL,
	`power_required` integer DEFAULT 0 NOT NULL,
	`water_required` integer DEFAULT 0 NOT NULL,
	`powered` integer DEFAULT false NOT NULL,
	`has_water` integer DEFAULT false NOT NULL,
	`operational` integer DEFAULT false NOT NULL,
	`built_at` integer NOT NULL,
	`owner_id` text NOT NULL,
	`construction_progress` integer DEFAULT 100 NOT NULL,
	`construction_started_at` integer,
	`construction_time_ticks` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parcel_id`) REFERENCES `parcels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_buildings_parcel` ON `buildings` (`parcel_id`);--> statement-breakpoint
CREATE INDEX `idx_buildings_owner` ON `buildings` (`owner_id`);--> statement-breakpoint
CREATE TABLE `city` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grid_width` integer DEFAULT 100 NOT NULL,
	`grid_height` integer DEFAULT 100 NOT NULL,
	`tick` integer DEFAULT 0 NOT NULL,
	`hour` integer DEFAULT 8 NOT NULL,
	`day` integer DEFAULT 1 NOT NULL,
	`year` integer DEFAULT 1 NOT NULL,
	`mayor_id` text,
	`treasury` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `election_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`user_id` text NOT NULL,
	`platform` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `mayor_elections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_candidates_election` ON `election_candidates` (`election_id`);--> statement-breakpoint
CREATE INDEX `idx_candidates_user` ON `election_candidates` (`user_id`);--> statement-breakpoint
CREATE TABLE `mayor_elections` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`nomination_start` integer NOT NULL,
	`voting_start` integer,
	`voting_end` integer,
	`winner_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_elections_status` ON `mayor_elections` (`status`);--> statement-breakpoint
CREATE INDEX `idx_elections_created_at` ON `mayor_elections` (`created_at`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`election_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`election_id`) REFERENCES `mayor_elections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `election_candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_votes_election` ON `votes` (`election_id`);--> statement-breakpoint
CREATE INDEX `idx_votes_voter` ON `votes` (`voter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_vote` ON `votes` (`election_id`,`voter_id`);--> statement-breakpoint
CREATE TABLE `parcels` (
	`id` text PRIMARY KEY NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`terrain` text DEFAULT 'land' NOT NULL,
	`zoning` text,
	`owner_id` text,
	`purchase_price` real,
	`purchase_date` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_parcels_coords_unique` ON `parcels` (`x`,`y`);--> statement-breakpoint
CREATE INDEX `idx_parcels_owner` ON `parcels` (`owner_id`);--> statement-breakpoint
CREATE TABLE `roads` (
	`id` text PRIMARY KEY NOT NULL,
	`parcel_id` text NOT NULL,
	`direction` text NOT NULL,
	`lanes` integer DEFAULT 2 NOT NULL,
	`traffic_load` real DEFAULT 0 NOT NULL,
	`speed_limit` integer DEFAULT 50 NOT NULL,
	FOREIGN KEY (`parcel_id`) REFERENCES `parcels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_roads_parcel` ON `roads` (`parcel_id`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`type` text NOT NULL,
	`position_x` real NOT NULL,
	`position_y` real NOT NULL,
	`destination_x` real,
	`destination_y` real,
	`path` text,
	`speed` real DEFAULT 1 NOT NULL,
	`sprite` text,
	FOREIGN KEY (`owner_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vehicles_position` ON `vehicles` (`position_x`,`position_y`);--> statement-breakpoint
CREATE INDEX `idx_vehicles_owner` ON `vehicles` (`owner_id`);--> statement-breakpoint
CREATE TABLE `power_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`from_x` integer NOT NULL,
	`from_y` integer NOT NULL,
	`to_x` integer NOT NULL,
	`to_y` integer NOT NULL,
	`capacity` integer NOT NULL,
	`load` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `power_plants` (
	`id` text PRIMARY KEY NOT NULL,
	`building_id` text NOT NULL,
	`capacity` integer NOT NULL,
	`current_output` integer DEFAULT 0 NOT NULL,
	`fuel_type` text NOT NULL,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `water_pipes` (
	`id` text PRIMARY KEY NOT NULL,
	`from_x` integer NOT NULL,
	`from_y` integer NOT NULL,
	`to_x` integer NOT NULL,
	`to_y` integer NOT NULL,
	`capacity` integer DEFAULT 100 NOT NULL,
	`flow` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `court_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`warning_id` text,
	`defendant_id` text NOT NULL,
	`plaintiff_id` text NOT NULL,
	`case_type` text NOT NULL,
	`amount` real NOT NULL,
	`hearing_date` integer,
	`verdict` text,
	`sentence` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`warning_id`) REFERENCES `rent_warnings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`defendant_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_court_cases_defendant` ON `court_cases` (`defendant_id`);--> statement-breakpoint
CREATE INDEX `idx_court_cases_status` ON `court_cases` (`status`);--> statement-breakpoint
CREATE TABLE `jail_inmates` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`case_id` text,
	`check_in` integer NOT NULL,
	`release_date` integer NOT NULL,
	`status` text DEFAULT 'incarcerated' NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `court_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_jail_inmates_agent` ON `jail_inmates` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_jail_inmates_status` ON `jail_inmates` (`status`);--> statement-breakpoint
CREATE TABLE `rent_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`amount_owed` real NOT NULL,
	`warning_date` integer NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `rental_units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rent_warnings_tenant` ON `rent_warnings` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_rent_warnings_status` ON `rent_warnings` (`status`);--> statement-breakpoint
CREATE TABLE `rental_units` (
	`id` text PRIMARY KEY NOT NULL,
	`building_id` text NOT NULL,
	`floor_number` integer NOT NULL,
	`unit_number` integer NOT NULL,
	`unit_type` text DEFAULT 'residential' NOT NULL,
	`monthly_rent` real NOT NULL,
	`tenant_id` text,
	`lease_start` integer,
	`status` text DEFAULT 'vacant' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rental_units_building` ON `rental_units` (`building_id`);--> statement-breakpoint
CREATE INDEX `idx_rental_units_tenant` ON `rental_units` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_rental_units_status` ON `rental_units` (`status`);