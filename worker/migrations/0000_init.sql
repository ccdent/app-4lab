CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`preview_size` integer DEFAULT 0 NOT NULL,
	`r2_key` text NOT NULL,
	`preview_r2_key` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `technician`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attachment_order` ON `attachment` (`order_id`);--> statement-breakpoint
CREATE TABLE `clinic` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`zip` text DEFAULT '' NOT NULL,
	`ico` text DEFAULT '' NOT NULL,
	`dic` text,
	`phone` text,
	`email` text,
	`contact_person_name` text,
	`color` text DEFAULT '#4FB6B2' NOT NULL,
	`note` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clinic_customer_group` (
	`clinic_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`clinic_id`, `group_id`),
	FOREIGN KEY (`clinic_id`) REFERENCES `clinic`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `customer_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `customer_group` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `doctor` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`title_prefix` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`note` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinic`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_doctor_clinic` ON `doctor` (`clinic_id`);--> statement-breakpoint
CREATE TABLE `doctor_preference` (
	`doctor_id` text NOT NULL,
	`option_id` text NOT NULL,
	PRIMARY KEY(`doctor_id`, `option_id`),
	FOREIGN KEY (`doctor_id`) REFERENCES `doctor`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `preference_option`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `instruction` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`html_content` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lab_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`zip` text DEFAULT '' NOT NULL,
	`ico` text DEFAULT '' NOT NULL,
	`dic` text,
	`phone` text,
	`email` text,
	`order_prefix_mode` text DEFAULT 'year' NOT NULL,
	`order_prefix` text DEFAULT '' NOT NULL,
	`logo_r2_key` text,
	`logo_content_type` text,
	`logo_updated_at` integer,
	`print_in_app_language` integer DEFAULT true NOT NULL,
	`enforce_material_proposals_on_done` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manufacturer` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code_prefix` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manufacturer_code_prefix_unique` ON `manufacturer` (`code_prefix`);--> statement-breakpoint
CREATE TABLE `material_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`manufacturer_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`is_order_usage_eligible` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_catalog_code_unique` ON `material_catalog` (`code`);--> statement-breakpoint
CREATE TABLE `order_item` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`price_list_item_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`unit_price` integer NOT NULL,
	`technician_fee` integer DEFAULT 0 NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`mdr_device` integer DEFAULT true NOT NULL,
	`localization` text,
	`bridge_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_list_item_id`) REFERENCES `price_list_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_order_item_order` ON `order_item` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_material_proposal` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`source_recipe_id` text,
	`source_recipe_item_id_snapshot` text NOT NULL,
	`source_recipe_name_snapshot` text NOT NULL,
	`line_type` text NOT NULL,
	`material_catalog_id` text,
	`material_code_snapshot` text,
	`material_name_snapshot` text,
	`manufacturer_name_snapshot` text,
	`placeholder_text` text,
	`suggested_stock_item_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_usage_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_omp_order_recipe_item` ON `order_material_proposal` (`order_id`,`source_recipe_item_id_snapshot`);--> statement-breakpoint
CREATE INDEX `idx_omp_order` ON `order_material_proposal` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_material_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`material_catalog_id` text,
	`stock_item_id` text,
	`display_name` text NOT NULL,
	`manufacturer_name` text NOT NULL,
	`lot_number` text NOT NULL,
	`expiration_date` text NOT NULL,
	`source_type` text DEFAULT 'stock' NOT NULL,
	`used_at` integer NOT NULL,
	`used_by` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_catalog_id`) REFERENCES `material_catalog`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `technician`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_omu_order` ON `order_material_usage` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_note` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `technician`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_order_note_order` ON `order_note` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_oral_cavity` (
	`order_id` text PRIMARY KEY NOT NULL,
	`color_mode` text DEFAULT 'NO_COLOR_REQUIRED' NOT NULL,
	`color_shade` text,
	`picker_state` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `order_state_log` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `technician`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_order_state_log_order` ON `order_state_log` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`is_billed` integer DEFAULT false NOT NULL,
	`billed_at` integer,
	`clinic_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`patient_name` text NOT NULL,
	`completion_due_at` text NOT NULL,
	`try_in_dates` text DEFAULT '[]' NOT NULL,
	`assigned_technician_id` text,
	`done_at` integer,
	`price_adjustment_amount` integer DEFAULT 0 NOT NULL,
	`price_adjustment_reason` text,
	`shipping_method_id` text,
	`shipping_price` integer DEFAULT 0 NOT NULL,
	`shipping_charged` integer DEFAULT false NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinic`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctor`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_technician_id`) REFERENCES `technician`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shipping_method_id`) REFERENCES `shipping_method`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `technician`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `idx_orders_state` ON `orders` (`state`);--> statement-breakpoint
CREATE INDEX `idx_orders_clinic` ON `orders` (`clinic_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_doctor` ON `orders` (`doctor_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_technician` ON `orders` (`assigned_technician_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_done_at` ON `orders` (`done_at`);--> statement-breakpoint
CREATE TABLE `preference_option` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_list_category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`instruction_id` text,
	FOREIGN KEY (`instruction_id`) REFERENCES `instruction`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `price_list_item` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`category_id` text NOT NULL,
	`group_id` text,
	`mdr_device` integer DEFAULT true NOT NULL,
	`kind` text,
	`single_indications` text DEFAULT '[]' NOT NULL,
	`bridge_stump_price` integer,
	`bridge_pontic_price` integer,
	`bridge_implant_price` integer,
	`price` integer NOT NULL,
	`technician_fee` integer DEFAULT 0 NOT NULL,
	`production_days` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `price_list_category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `customer_group`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_price_list_item_code_active` ON `price_list_item` (`code`) WHERE archived = 0;--> statement-breakpoint
CREATE INDEX `idx_price_list_item_category` ON `price_list_item` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_price_list_item_group` ON `price_list_item` (`group_id`);--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_item` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`line_type` text NOT NULL,
	`material_catalog_id` text,
	`placeholder_text` text,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_catalog_id`) REFERENCES `material_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recipe_item_recipe` ON `recipe_item` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipe_price_list_item` (
	`recipe_id` text NOT NULL,
	`price_list_item_id` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `price_list_item_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`price_list_item_id`) REFERENCES `price_list_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rpli_price_list_item` ON `recipe_price_list_item` (`price_list_item_id`);--> statement-breakpoint
CREATE TABLE `shipping_method` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_item` (
	`id` text PRIMARY KEY NOT NULL,
	`material_catalog_id` text NOT NULL,
	`short_code` text NOT NULL,
	`lot_number` text NOT NULL,
	`expiration_date` text NOT NULL,
	`received_at` integer NOT NULL,
	`opened_at` integer,
	`purchase_reference` text,
	`status` text DEFAULT 'active' NOT NULL,
	`consumption_mode` text DEFAULT 'reusable_lot' NOT NULL,
	`first_used_at` integer,
	FOREIGN KEY (`material_catalog_id`) REFERENCES `material_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_item_short_code_unique` ON `stock_item` (`short_code`);--> statement-breakpoint
CREATE INDEX `idx_stock_item_catalog` ON `stock_item` (`material_catalog_id`);--> statement-breakpoint
CREATE INDEX `idx_stock_item_status` ON `stock_item` (`status`);--> statement-breakpoint
CREATE TABLE `technician` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'technician' NOT NULL,
	`payroll_password_hash` text,
	`perm_orders_view_all` integer DEFAULT true NOT NULL,
	`perm_orders_create_for_others` integer DEFAULT true NOT NULL,
	`perm_doctors_edit` integer DEFAULT true NOT NULL,
	`perm_price_list_edit` integer DEFAULT true NOT NULL,
	`perm_materials_edit` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `technician_email_unique` ON `technician` (`email`);