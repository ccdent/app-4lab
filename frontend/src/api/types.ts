// Typy odpovědí Worker API (kontrakt s worker/src/routes/*).

export interface ClinicListRow {
  id: string;
  companyName: string;
  city: string;
  ico: string;
  phone: string | null;
  email: string | null;
  color: string;
  isActive: boolean;
  doctorCount: number;
}

export interface ClinicDetail {
  id: string;
  companyName: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string | null;
  phone: string | null;
  email: string | null;
  contactPersonName: string | null;
  color: string;
  note: string | null;
  isActive: boolean;
  groupIds: string[];
}

export interface DoctorListRow {
  id: string;
  titlePrefix: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  clinicId: string;
  clinicName: string;
  clinicColor: string;
}

export interface DoctorDetail {
  id: string;
  clinicId: string;
  titlePrefix: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  preferenceOptionIds: string[];
  preferenceLabels: string[];
}

export interface PreferenceOption {
  id: string;
  label: string;
  isActive: boolean;
  usageCount: number;
}

export interface CustomerGroup {
  id: string;
  name: string;
  note: string | null;
  /** Výchozí skupina — předvyplní se u nové položky ceníku a nové kliniky. */
  isDefault: boolean;
  itemCount: number;
}

export interface PriceListCategory {
  id: string;
  name: string;
  instructionId: string | null;
  instructionName: string | null;
  itemCount: number;
}

/** Návod k použití ZP — řádek seznamu (bez HTML obsahu). */
export interface InstructionRow {
  id: string;
  name: string;
  archived: boolean;
  updatedAt: number;
  categoryCount: number;
}

/** Návod k použití ZP — detail včetně HTML obsahu. */
export interface InstructionDetail {
  id: string;
  name: string;
  htmlContent: string;
  archived: boolean;
}

/** Návod dohledaný pro zakázku (tisk prohlášení). */
export interface OrderInstruction {
  id: string;
  name: string;
  htmlContent: string;
  itemIds: string[];
}

/** Typ položky vůči mapě zubů (null = běžná položka bez lokalizace). */
export type PriceListItemKind = "single" | "bridge" | "arch";

/** Indikace členové položky — mapují se na stavy zubů (MISSING → PONTIC). */
export type SingleIndication = "STUMP" | "PONTIC" | "IMPLANT";

export interface PriceListItemRow {
  id: string;
  code: string;
  name: string;
  shortName: string;
  categoryId: string;
  categoryName: string;
  groupId: string | null;
  groupName: string | null;
  mdrDevice: boolean;
  kind: PriceListItemKind | null;
  /** Haléře. */
  price: number;
  /** Haléře. */
  technicianFee: number;
  productionDays: number | null;
  archived: boolean;
}

export interface PriceListItemDetail {
  id: string;
  code: string;
  name: string;
  shortName: string;
  categoryId: string;
  groupId: string | null;
  mdrDevice: boolean;
  kind: PriceListItemKind | null;
  singleIndications: SingleIndication[];
  bridgeStumpPrice: number | null;
  bridgePonticPrice: number | null;
  bridgeImplantPrice: number | null;
  price: number;
  technicianFee: number;
  productionDays: number | null;
  archived: boolean;
}

import type { OrderState } from "../shared/orderStates";

export interface OrderListRow {
  id: string;
  orderNumber: string;
  state: OrderState;
  isBilled: boolean;
  patientName: string;
  completionDueAt: string;
  doneAt: number | null;
  clinicId: string;
  clinicName: string;
  clinicColor: string;
  doctorId: string;
  doctorTitlePrefix: string | null;
  doctorFirstName: string;
  doctorLastName: string;
  assignedTechnicianId: string | null;
  technicianFirstName: string | null;
  technicianLastName: string | null;
  createdAt: number;
  /** Haléře — součet položek. */
  itemsTotal: number;
  /** Náhled obsahu: „2× Korunka CK, Můstek CK" (zkrácené názvy). */
  itemsSummary: string | null;
}

export interface OrderItemSnapshot {
  id: string;
  priceListItemId: string | null;
  code: string;
  name: string;
  shortName: string;
  unitPrice: number;
  technicianFee: number;
  quantity: number;
  /** Snapshot MDR příznaku — jen ZP jdou na štítek/prohlášení. */
  mdrDevice: boolean;
  /** SN suffix: zub "21" / můstek "13-23" / čelist "01"|"02". */
  localization: string | null;
  bridgeId: string | null;
}

export interface OrderOralCavity {
  colorMode: "NO_COLOR_REQUIRED" | "LAB_TO_CHOOSE" | "SHADE";
  colorShade: string | null;
  pickerState: unknown;
}

export interface OrderNoteRow {
  id: string;
  body: string;
  createdAt: number;
  authorFirstName: string;
  authorLastName: string;
}

export interface OrderStateLogRow {
  id: string;
  fromState: OrderState;
  toState: OrderState;
  changedAt: number;
  changedByFirstName: string;
  changedByLastName: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  state: OrderState;
  isBilled: boolean;
  billedAt: number | null;
  clinicId: string;
  doctorId: string;
  patientName: string;
  completionDueAt: string;
  tryInDates: string[];
  assignedTechnicianId: string | null;
  doneAt: number | null;
  priceAdjustmentAmount: number;
  priceAdjustmentReason: string | null;
  shippingMethodId: string | null;
  shippingPrice: number;
  shippingCharged: boolean;
  note: string | null;
  createdAt: number;
  clinicName: string;
  clinicColor: string;
  doctorTitlePrefix: string | null;
  doctorFirstName: string;
  doctorLastName: string;
  technicianFirstName: string | null;
  technicianLastName: string | null;
  shippingMethodName: string | null;
  items: OrderItemSnapshot[];
  oralCavity: OrderOralCavity | null;
  notes: OrderNoteRow[];
  stateLog: OrderStateLogRow[];
  doctorPreferences: string[];
  attachments: AttachmentRow[];
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  previewR2Key: string | null;
  createdAt: number;
}

export interface PickerItem {
  id: string;
  code: string;
  name: string;
  shortName: string;
  price: number;
  technicianFee: number;
  mdrDevice: boolean;
  kind: PriceListItemKind | null;
  singleIndications: SingleIndication[];
  bridgeStumpPrice: number | null;
  bridgePonticPrice: number | null;
  bridgeImplantPrice: number | null;
}

export type TechnicianRole = "technician" | "lead";

export interface TechnicianRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: TechnicianRole;
  hasPayrollPassword: number;
  permOrdersViewAll: boolean;
  permOrdersCreateForOthers: boolean;
  permDoctorsEdit: boolean;
  permPriceListEdit: boolean;
  permMaterialsEdit: boolean;
  isActive: boolean;
}

/** Zobrazované jméno doktora: „MUDr. Jan Novák". */
export function doctorDisplayName(d: {
  titlePrefix: string | null;
  firstName: string;
  lastName: string;
}): string {
  return [d.titlePrefix, d.firstName, d.lastName].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Materiály (MDR)                                                     */
/* ------------------------------------------------------------------ */

export type StockItemStatus = "active" | "used" | "consumed" | "discarded";
export type ConsumptionMode = "reusable_lot" | "one_time";
export type RecipeLineType = "catalog_item" | "placeholder";
export type ProposalStatus = "pending" | "resolved" | "discarded" | "obsolete";

export interface ManufacturerRow {
  id: string;
  name: string;
  codePrefix: string;
  isActive: boolean;
  catalogCount: number;
}

export interface MaterialCatalogRow {
  id: string;
  code: string;
  canonicalName: string;
  manufacturerId: string;
  manufacturerName: string;
  isOrderUsageEligible: boolean;
  isActive: boolean;
  activeLotCount: number;
}

export interface StockLot {
  stockItemId: string;
  shortCode: string;
  lotNumber: string;
  expirationDate: string;
  status: StockItemStatus;
  consumptionMode: ConsumptionMode;
  firstUsedAt: number | null;
  receivedAt: number;
}

export interface StockItemRow {
  id: string;
  shortCode: string;
  lotNumber: string;
  expirationDate: string;
  status: StockItemStatus;
  consumptionMode: ConsumptionMode;
  receivedAt: number;
  firstUsedAt: number | null;
  materialCatalogId: string;
  materialCode: string;
  canonicalName: string;
  manufacturerName: string;
}

export interface StockItemByCode {
  id: string;
  shortCode: string;
  lotNumber: string;
  expirationDate: string;
  status: StockItemStatus;
  consumptionMode: ConsumptionMode;
  materialCatalogId: string;
  materialCode: string;
  canonicalName: string;
  manufacturerName: string;
  isOrderUsageEligible: boolean;
  isAvailableForUsage: boolean;
}

export interface MaterialUsageRow {
  id: string;
  displayName: string;
  manufacturerName: string;
  lotNumber: string;
  expirationDate: string;
  sourceType: string;
  usedAt: number;
  shortCode: string | null;
  consumptionMode: ConsumptionMode | null;
  usedByFirstName: string | null;
  usedByLastName: string | null;
}

export interface MaterialProposalRow {
  id: string;
  sourceRecipeNameSnapshot: string;
  lineType: RecipeLineType;
  materialCatalogId: string | null;
  materialCodeSnapshot: string | null;
  materialNameSnapshot: string | null;
  manufacturerNameSnapshot: string | null;
  placeholderText: string | null;
  status: ProposalStatus;
  suggestedStockItemId: string | null;
  suggestedShortCode: string | null;
  suggestedLotNumber: string | null;
  suggestedExpirationDate: string | null;
  isSuggestedLotAvailable: boolean;
  createdAt: number;
}

export interface ProposalSyncResult {
  inserted: number;
  obsoleted: number;
  reactivated: number;
}

export interface RecipeListRow {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  itemCount: number;
  assignedCount: number;
}

export interface RecipeLineRow {
  id: string;
  lineType: RecipeLineType;
  materialCatalogId: string | null;
  placeholderText: string | null;
  note: string | null;
  sortOrder: number;
  materialCode: string | null;
  materialName: string | null;
  manufacturerName: string | null;
}

export interface RecipeDetail {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  items: RecipeLineRow[];
  priceListItemIds: string[];
}

export interface BillingItem {
  name: string;
  localization: string | null;
  quantity: number;
  unitPrice: number;
}

export interface BillingRow {
  id: string;
  orderNumber: string;
  patientName: string;
  clinicId: string;
  clinicName: string;
  doctorTitlePrefix: string | null;
  doctorFirstName: string;
  doctorLastName: string;
  doneAt: number | null;
  isBilled: boolean;
  billedAt: number | null;
  priceAdjustmentAmount: number;
  priceAdjustmentReason: string | null;
  shippingPrice: number;
  shippingCharged: boolean;
  itemsTotal: number;
  billableTotal: number;
  items: BillingItem[];
}

export interface ShippingMethodRow {
  id: string;
  name: string;
  orderCount: number;
}

/* ------------------------------------------------------------------ */
/*  Vyúčtování (podíl z obratu)                                         */
/* ------------------------------------------------------------------ */

export interface PayrollStatus {
  hasPassword: boolean;
  role: TechnicianRole;
}

export interface PayrollTechnician {
  id: string;
  firstName: string;
  lastName: string;
  current: { done: number; open: number; total: number };
  period: {
    total: number;
    orders: { orderNumber: string; patientName: string; doneAt: number | null; share: number }[];
  };
}

export interface PayrollView {
  role: TechnicianRole;
  currentMonth: string;
  technicians: PayrollTechnician[];
}
