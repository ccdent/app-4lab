import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import dayjs from "dayjs";
import { api } from "../../api/client";
import {
  doctorDisplayName,
  type DoctorListRow,
  type OrderDetail,
  type PickerItem,
  type ShippingMethodRow,
  type SingleIndication,
  type TechnicianRow,
} from "../../api/types";
import {
  emptyOralCavityValue,
  normalizeOralCavityValue,
  sortTeethByArchOrder,
  STATE_NAME,
  type OralCavityValue,
  type ToothState,
} from "../../shared/oralCavity";
import { formatHalere, halereToKc, kcToHalere } from "../../shared/money";
import OralCavityPicker from "../../components/orders/OralCavityPicker";
import FormDateInput from "../../components/form/FormDateInput";
import FormPageShell from "../../components/ui/FormPageShell";
import { useAuth } from "../../auth/authContext";
import { t } from "../../i18n";
import { notifyError, notifySuccess, notifyWarning } from "../../lib/notify";

/* ------------------------------------------------------------------ */
/*  Typy lokálního stavu                                                */
/* ------------------------------------------------------------------ */

interface DraftItem {
  /** id existujícího řádku (edit) — kvůli diff save; nové řádky mají key. */
  id: string | null;
  key: string;
  priceListItemId: string | null;
  code: string;
  name: string;
  shortName: string;
  unitPrice: number;
  technicianFee: number;
  quantity: number;
  mdrDevice: boolean;
  localization: string | null;
  bridgeId: string | null;
}

// VITA classical (A1–D4; D1 v classical neexistuje) + bleach BL1–BL4.
const SHADES = [
  "BL1", "BL2", "BL3", "BL4",
  "A1", "A2", "A3", "A3.5", "A4",
  "B1", "B2", "B3", "B4",
  "C1", "C2", "C3", "C4",
  "D2", "D3", "D4",
];

/** Stav zubu → indikace členové položky. */
const STATE_TO_INDICATION: Partial<Record<ToothState, SingleIndication>> = {
  STUMP: "STUMP",
  MISSING: "PONTIC",
  IMPLANT: "IMPLANT",
};

let draftKeySeq = 0;
const nextKey = () => `draft-${++draftKeySeq}`;

/* ------------------------------------------------------------------ */
/*  Stránka                                                             */
/* ------------------------------------------------------------------ */

/** NEW (`/app/orders/new`) i EDIT (`/app/orders/:id/edit`). */
export default function OrderFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const isMobile = useMediaQuery("(max-width: 47.99em)") ?? false;
  const { me } = useAuth();
  const canAssignOthers = me.role === "lead" || me.perms.ordersCreateForOthers;

  // Číselníky
  const [doctors, setDoctors] = useState<DoctorListRow[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [pickerItems, setPickerItems] = useState<PickerItem[]>([]);

  // Hlavička
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState("");
  const [completionDueAt, setCompletionDueAt] = useState<string | null>(null);
  const [tryInDates, setTryInDates] = useState<string[]>([]);
  // Bez oprávnění „za ostatní" je zakázka vždy na autora (server to vynucuje).
  const [technicianId, setTechnicianId] = useState<string | null>(
    null, // prefill po mountu (me je v kontextu) — viz useEffect níže
  );
  const [note, setNote] = useState("");

  // Mapa zubů + barva
  const [oralCavity, setOralCavity] = useState<OralCavityValue>(emptyOralCavityValue());
  const [colorMode, setColorMode] = useState<"NO_COLOR_REQUIRED" | "LAB_TO_CHOOSE" | "SHADE">(
    "NO_COLOR_REQUIRED",
  );
  const [colorShade, setColorShade] = useState<string | null>(null);

  // Rozpracované výběry v sekci lokalizovaných výrobků (klíč = lokalizace)
  const [pendingSelections, setPendingSelections] = useState<Record<string, string | null>>({});

  // Položky
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pickerSelection, setPickerSelection] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Doprava + úprava ceny
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodRow[]>([]);
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [shippingPrice, setShippingPrice] = useState(0); // haléře; 0 = neúčtuje se
  const [adjustmentAmount, setAdjustmentAmount] = useState(0); // haléře, ±
  const [adjustmentReason, setAdjustmentReason] = useState("");

  // Nová zakázka bez oprávnění „za ostatní": předvyplnit sebe.
  useEffect(() => {
    if (!isEdit && !canAssignOthers) setTechnicianId(me.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Načtení číselníků + zakázky (edit) --------------- */

  useEffect(() => {
    void (async () => {
      try {
        const [doctorList, technicianList, shippingList] = await Promise.all([
          api.get<DoctorListRow[]>("/doctors"),
          // includeInactive: zakázka může mít přiřazeného deaktivovaného
          // technika — bez něj by select ukazoval prázdno.
          api.get<TechnicianRow[]>("/technicians?includeInactive=1"),
          api.get<ShippingMethodRow[]>("/shipping-methods"),
        ]);
        setDoctors(doctorList);
        setTechnicians(technicianList);
        setShippingMethods(shippingList);

        if (id) {
          const o = await api.get<OrderDetail>(`/orders/${id}`);
          if (o.isBilled) {
            notifyWarning(t("Vyfakturovaná zakázka je zamčená."));
            navigate(`/app/orders/${id}`);
            return;
          }
          setClinicId(o.clinicId);
          setDoctorId(o.doctorId);
          setPatientName(o.patientName);
          setCompletionDueAt(o.completionDueAt);
          setTryInDates(o.tryInDates);
          setTechnicianId(o.assignedTechnicianId);
          setNote(o.note ?? "");
          setShippingMethodId(o.shippingMethodId);
          // Účtování je odvozené z částky (0 = neúčtuje se) — starý flag
          // se při načtení promítne do částky.
          setShippingPrice(o.shippingCharged ? o.shippingPrice : 0);
          setAdjustmentAmount(o.priceAdjustmentAmount);
          setAdjustmentReason(o.priceAdjustmentReason ?? "");
          if (o.oralCavity) {
            setOralCavity(normalizeOralCavityValue(o.oralCavity.pickerState));
            setColorMode(o.oralCavity.colorMode);
            setColorShade(o.oralCavity.colorShade);
          }
          setItems(
            o.items.map((i) => ({
              id: i.id,
              key: i.id,
              priceListItemId: i.priceListItemId,
              code: i.code,
              name: i.name,
              shortName: i.shortName,
              unitPrice: i.unitPrice,
              technicianFee: i.technicianFee,
              quantity: i.quantity,
              mdrDevice: i.mdrDevice,
              localization: i.localization,
              bridgeId: i.bridgeId,
            })),
          );
        }
      } catch (err) {
        notifyError(err instanceof Error ? err.message : t("Nepodařilo se načíst data"));
        navigate("/app/orders");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Picker položek podle kliniky (skupiny řídí viditelnost).
  useEffect(() => {
    if (!clinicId) {
      setPickerItems([]);
      return;
    }
    void api
      .get<PickerItem[]>(`/orders/picker-items?clinicId=${clinicId}`)
      .then(setPickerItems)
      .catch(() => setPickerItems([]));
  }, [clinicId]);

  /* ---------------- Lokalizované cíle z mapy zubů -------------------- */

  interface LocalizationTarget {
    /** Lokalizace = klíč (zub "21", můstek "13-23", čelist "01"/"02"). */
    localization: string;
    label: string;
    /** Filtrované položky ceníku, které sem logicky sedí. */
    options: PickerItem[];
    /** Výpočet ceny pro konkrétní položku (haléře). */
    priceFor: (item: PickerItem) => number;
    bridgeId: string | null;
  }

  const targets = useMemo<LocalizationTarget[]>(() => {
    const result: LocalizationTarget[] = [];
    const inBridge = new Set(oralCavity.bridges.flatMap((b) => b.teeth));

    // Samostatné členy: zub se stavem mimo můstek
    const singleTeeth = Object.entries(oralCavity.toothStates)
      .map(([tooth, state]) => ({ tooth: Number(tooth), state }))
      .filter(
        (x) =>
          x.state !== "EMPTY" &&
          !inBridge.has(x.tooth) &&
          STATE_TO_INDICATION[x.state],
      );
    for (const { tooth, state } of sortTeethByArchOrder(singleTeeth.map((x) => x.tooth)).map(
      (t) => ({ tooth: t, state: oralCavity.toothStates[String(t)] as ToothState }),
    )) {
      const indication = STATE_TO_INDICATION[state]!;
      result.push({
        localization: String(tooth),
        label: t("Zub {zub} — {stav}", { zub: tooth, stav: t(STATE_NAME[state]) }),
        options: pickerItems.filter(
          (p) => p.kind === "single" && p.singleIndications.includes(indication),
        ),
        priceFor: (item) => item.price,
        bridgeId: null,
      });
    }

    // Můstky: cena = součet členů dle stavů
    for (const bridge of oralCavity.bridges) {
      const teeth = sortTeethByArchOrder(bridge.teeth);
      const localization = teeth.length > 1 ? `${teeth[0]}-${teeth[teeth.length - 1]}` : String(teeth[0]);
      result.push({
        localization,
        label: t("Můstek {lokalizace} ({celist})", {
          lokalizace: localization,
          celist: bridge.arch === "UPPER" ? t("horní") : t("dolní"),
        }),
        options: pickerItems.filter((p) => p.kind === "bridge"),
        priceFor: (item) =>
          teeth.reduce((sum, tooth) => {
            const state = (oralCavity.toothStates[String(tooth)] ?? "EMPTY") as ToothState;
            switch (state) {
              case "STUMP": return sum + (item.bridgeStumpPrice ?? 0);
              case "MISSING": return sum + (item.bridgePonticPrice ?? 0);
              case "IMPLANT": return sum + (item.bridgeImplantPrice ?? 0);
              default: return sum;
            }
          }, 0),
        bridgeId: bridge.id,
      });
    }

    // Čelisti: 01 horní / 02 dolní
    for (const arch of oralCavity.archSelections) {
      result.push({
        localization: arch === "ARCH_UPPER" ? "01" : "02",
        label: arch === "ARCH_UPPER" ? t("Horní čelist (01)") : t("Dolní čelist (02)"),
        options: pickerItems.filter((p) => p.kind === "arch"),
        priceFor: (item) => item.price,
        bridgeId: null,
      });
    }

    return result;
  }, [oralCavity, pickerItems]);

  const addLocalizedItem = useCallback(
    (target: LocalizationTarget) => {
      const itemId = pendingSelections[target.localization];
      const src = target.options.find((p) => p.id === itemId);
      if (!src) return;
      // Pojistka proti duplicitám: jedna lokalizace = jeden výrobek (SN je unikátní).
      if (items.some((i) => i.localization === target.localization)) {
        notifyWarning(
          t("Lokalizace {lokalizace} už výrobek má — nejdřív ho smaž v Položkách.", { lokalizace: target.localization }),
        );
        return;
      }
      const price = target.priceFor(src);
      if (target.bridgeId && price === 0) {
        notifyWarning(t("Cena můstku vyšla 0 Kč — zkontroluj členské ceny položky a stavy zubů."));
      }
      setItems((prev) => [
        ...prev,
        {
          id: null,
          key: nextKey(),
          priceListItemId: src.id,
          code: src.code,
          name: src.name,
          shortName: src.shortName,
          unitPrice: price,
          technicianFee: src.technicianFee,
          quantity: 1,
          mdrDevice: src.mdrDevice,
          localization: target.localization,
          bridgeId: target.bridgeId,
        },
      ]);
      setPendingSelections((prev) => ({ ...prev, [target.localization]: null }));
    },
    [pendingSelections, items],
  );

  /* ---------------- Položky ------------------------------------------ */

  const addPickerItem = useCallback(
    (itemId: string) => {
      const src = pickerItems.find((p) => p.id === itemId);
      if (!src) return;
      setItems((prev) => {
        // Stejná volná položka (bez lokalizace) → jen zvýšit počet.
        const existing = prev.find(
          (i) => i.priceListItemId === itemId && !i.localization && !i.bridgeId,
        );
        if (existing) {
          return prev.map((i) =>
            i.key === existing.key ? { ...i, quantity: i.quantity + 1 } : i,
          );
        }
        return [
          ...prev,
          {
            id: null,
            key: nextKey(),
            priceListItemId: src.id,
            code: src.code,
            name: src.name,
            shortName: src.shortName,
            unitPrice: src.price,
            technicianFee: src.technicianFee,
            quantity: 1,
            mdrDevice: src.mdrDevice,
            localization: null,
            bridgeId: null,
          },
        ];
      });
      setPickerSelection(null);
    },
    [pickerItems],
  );

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  /**
   * Změna mapy zubů: položky, jejichž lokalizace (nebo můstek) už v mapě
   * neexistuje, se odeberou — jinak by na prohlášení šly osiřelé SN
   * a stejná lokalizace by šla přidat podruhé.
   */
  const handleOralCavityChange = (value: OralCavityValue) => {
    setOralCavity(value);
    const valid = new Set<string>();
    const inBridge = new Set(value.bridges.flatMap((b) => b.teeth));
    for (const [tooth, state] of Object.entries(value.toothStates)) {
      if (
        state !== "EMPTY" &&
        !inBridge.has(Number(tooth)) &&
        STATE_TO_INDICATION[state as ToothState]
      ) {
        valid.add(tooth);
      }
    }
    const bridgeIds = new Set(value.bridges.map((b) => b.id));
    for (const b of value.bridges) {
      const teeth = sortTeethByArchOrder(b.teeth);
      valid.add(teeth.length > 1 ? `${teeth[0]}-${teeth[teeth.length - 1]}` : String(teeth[0]));
    }
    for (const arch of value.archSelections) {
      valid.add(arch === "ARCH_UPPER" ? "01" : "02");
    }
    const orphaned = items.filter(
      (i) =>
        i.localization &&
        (!valid.has(i.localization) || (i.bridgeId ? !bridgeIds.has(i.bridgeId) : false)),
    );
    if (orphaned.length) {
      const keys = new Set(orphaned.map((i) => i.key));
      setItems((prev) => prev.filter((i) => !keys.has(i.key)));
      notifyWarning(
        t("Z položek odebráno (lokalizace už není v mapě): {polozky}", {
          polozky: orphaned.map((i) => `${i.shortName} (${i.localization})`).join(", "),
        }),
      );
    }
  };

  const itemsTotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  /* ---------------- Uložení ------------------------------------------ */

  const handleSubmit = async () => {
    if (!clinicId || !doctorId || !patientName.trim() || !completionDueAt) {
      notifyError(t("Vyplň kliniku, doktora, pacienta a termín."));
      return;
    }
    if (colorMode === "SHADE" && !colorShade) {
      notifyError(t("Vyber odstín, nebo přepni režim barvy."));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clinicId,
        doctorId,
        patientName: patientName.trim(),
        completionDueAt,
        tryInDates,
        assignedTechnicianId: technicianId,
        note: note.trim() || null,
        shippingMethodId,
        shippingPrice: shippingMethodId ? shippingPrice : 0,
        shippingCharged: Boolean(shippingMethodId) && shippingPrice > 0,
        priceAdjustmentAmount: adjustmentAmount,
        priceAdjustmentReason: adjustmentAmount !== 0 ? adjustmentReason.trim() || null : null,
        items: items.map((i) => ({
          id: i.id,
          priceListItemId: i.priceListItemId,
          code: i.code,
          name: i.name,
          shortName: i.shortName,
          unitPrice: i.unitPrice,
          technicianFee: i.technicianFee,
          quantity: i.quantity,
          mdrDevice: i.mdrDevice,
          localization: i.localization,
          bridgeId: i.bridgeId,
        })),
        oralCavity: {
          colorMode,
          colorShade: colorMode === "SHADE" ? colorShade : null,
          pickerState: oralCavity,
        },
      };
      if (isEdit) {
        await api.put(`/orders/${id}`, payload);
        notifySuccess(t("Zakázka uložena."));
        navigate(`/app/orders/${id}`);
      } else {
        const res = await api.post<{ id: string; orderNumber: string }>("/orders", payload);
        notifySuccess(t("Zakázka {cislo} založena.", { cislo: res.orderNumber }));
        navigate(`/app/orders/${res.id}`);
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Uložení se nepodařilo"));
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Render ------------------------------------------- */

  const backTo = isEdit ? `/app/orders/${id}` : "/app/orders";

  return (
    <FormPageShell title={isEdit ? t("Upravit zakázku") : t("Nová zakázka")} backTo={backTo}>
      <Stack gap="lg">
        {/* -------- Hlavička -------- */}
        <Card withBorder>
          <Title order={4} mb="md">{t("Zadavatel a pacient")}</Title>
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              {/* Doktor je primární; klinika (v závorce) je jen nosič
                  fakturačních údajů a odvodí se z doktora automaticky. */}
              <Select
                label={t("Doktor")}
                required
                searchable
                disabled={loading}
                data={doctors.map((d) => ({
                  value: d.id,
                  label: `${doctorDisplayName(d)} (${d.clinicName})`,
                }))}
                value={doctorId}
                onChange={(v) => {
                  setDoctorId(v);
                  const doc = doctors.find((d) => d.id === v);
                  setClinicId(doc?.clinicId ?? null);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label={t("Pacient")}
                required
                disabled={loading}
                value={patientName}
                onChange={(e) => setPatientName(e.currentTarget.value)}
              />
            </Grid.Col>
            {/* Technik zarovnaný pod Doktora (stejná šířka), termín vedle. */}
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label={t("Technik")}
                description={
                  canAssignOthers ? undefined : t("Můžeš zadávat zakázky jen za sebe.")
                }
                // Popisek AŽ pod input — jinak odsadí input a rozhodí řádek
                // vedle Termínu dokončení.
                inputWrapperOrder={["label", "input", "description", "error"]}
                clearable={canAssignOthers}
                disabled={loading || !canAssignOthers}
                data={technicians
                  .filter((tech) => tech.isActive || tech.id === technicianId)
                  .map((tech) => ({
                    value: tech.id,
                    label: `${tech.firstName} ${tech.lastName}${tech.isActive ? "" : ` ${t("(neaktivní)")}`}`,
                  }))}
                value={technicianId}
                onChange={setTechnicianId}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <FormDateInput
                label={t("Termín dokončení")}
                required
                value={completionDueAt}
                onChange={setCompletionDueAt}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Group gap="xs" align="flex-end">
                <FormDateInput
                  label={t("Termíny zkoušek (informativní)")}
                  value={null}
                  onChange={(iso: string | null) => {
                    if (!iso) return;
                    setTryInDates((prev) => (prev.includes(iso) ? prev : [...prev, iso].sort()));
                  }}
                />
                {tryInDates.map((d) => (
                  <Badge
                    key={d}
                    variant="light"
                    size="lg"
                    rightSection={
                      <ActionIcon
                        size="xs"
                        variant="transparent"
                        onClick={() => setTryInDates((prev) => prev.filter((x) => x !== d))}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    }
                  >
                    {dayjs(d).format("D. M. YYYY")}
                  </Badge>
                ))}
              </Group>
            </Grid.Col>
          </Grid>
        </Card>

        {/* -------- Mapa zubů -------- */}
        <Card withBorder>
          <Title order={4} mb="md">{t("Mapa zubů")}</Title>
          <OralCavityPicker value={oralCavity} onChange={handleOralCavityChange} disabled={loading} />
          <Grid gutter="md" mt="md">
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <Text size="sm" fw={500} mb={4} c="light-dark(#374151, #cfcfcf)">{t("Barva")}</Text>
              <SegmentedControl
                fullWidth
                value={colorMode}
                onChange={(v) => setColorMode(v as typeof colorMode)}
                data={[
                  { value: "NO_COLOR_REQUIRED", label: t("Bez barvy") },
                  { value: "LAB_TO_CHOOSE", label: t("Výběr v laboratoři") },
                  { value: "SHADE", label: t("Odstín") },
                ]}
              />
            </Grid.Col>
            {colorMode === "SHADE" && (
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Select
                  label={t("Odstín (VITA)")}
                  searchable
                  data={SHADES}
                  value={colorShade}
                  onChange={setColorShade}
                />
              </Grid.Col>
            )}
          </Grid>
        </Card>

        {/* -------- Výrobky dle mapy zubů (lokalizace) -------- */}
        {targets.length > 0 && (
          <Card withBorder>
            <Title order={4} mb="xs">{t("Výrobky dle mapy zubů")}</Title>
            <Text size="sm" c="dimmed" mb="md">
              {t("Ke každé lokalizaci vyber položku z ceníku — nabízí se jen ty, které logicky sedí (indikace / můstek / čelist). Lokalizace se tiskne jako sériové číslo.")}
            </Text>
            {!doctorId && (
              <Alert color="orange" variant="light" mb="md">
                {t("Nejdřív nahoře vyber doktora — podle jeho kliniky se nabízí položky ceníku.")}
              </Alert>
            )}
            <Stack gap="sm">
              {targets.map((tg) => {
                const added = items.filter((i) => i.localization === tg.localization);
                const selected = pendingSelections[tg.localization] ?? null;
                const selectedItem = tg.options.find((p) => p.id === selected) ?? null;
                return (
                  <Group key={tg.localization} gap="sm" wrap="wrap">
                    <Badge variant="light" color="teal" style={{ width: 200, justifyContent: "flex-start" }}>
                      {tg.label}
                    </Badge>
                    {added.length > 0 ? (
                      /* Jedna lokalizace = jeden výrobek (SN). Výměna = smazat
                         položku v sekci Položky, pak se výběr zase nabídne. */
                      added.map((a) => (
                        <Tooltip
                          key={a.key}
                          label={t("Výrobek vybrán. Pro změnu ho nejdříve smaž z položek.")}
                        >
                          <Select
                            size="xs"
                            style={{ flex: 1, minWidth: 260, maxWidth: 520 }}
                            disabled
                            data={[
                              {
                                value: "x",
                                label: `${a.code} — ${a.name} (${formatHalere(a.unitPrice)})`,
                              },
                            ]}
                            value="x"
                          />
                        </Tooltip>
                      ))
                    ) : (
                      <>
                        <Select
                          placeholder={
                            tg.options.length
                              ? t("Vyber položku ceníku...")
                              : doctorId
                                ? t("Žádná položka v ceníku pro tuto indikaci")
                                : t("Nejdřív vyber doktora")
                          }
                          searchable
                          clearable
                          size="xs"
                          style={{ flex: 1, minWidth: 260, maxWidth: 520 }}
                          disabled={tg.options.length === 0}
                          data={tg.options.map((p) => ({
                            value: p.id,
                            label: `${p.code} — ${p.name} (${formatHalere(tg.priceFor(p))})`,
                          }))}
                          value={selected}
                          onChange={(v) =>
                            setPendingSelections((prev) => ({ ...prev, [tg.localization]: v }))
                          }
                        />
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconPlus size={14} />}
                          disabled={!selectedItem}
                          onClick={() => addLocalizedItem(tg)}
                        >
                          {t("Přidat")}
                        </Button>
                      </>
                    )}
                  </Group>
                );
              })}
            </Stack>
          </Card>
        )}

        {/* -------- Položky -------- */}
        <Card withBorder>
          <Title order={4} mb="md">{t("Položky")}</Title>
          <Group gap="sm" mb="md">
            <Select
              placeholder={
                clinicId
                  ? pickerItems.length
                    ? t("Přidat položku bez lokalizace...")
                    : t("Klinika nemá žádné položky (zkontroluj skupiny)")
                  : t("Nejdřív vyber doktora")
              }
              searchable
              clearable
              style={{ flex: 1, maxWidth: 480 }}
              disabled={!clinicId || pickerItems.length === 0}
              data={pickerItems
                // Jen ne-ZP: zdravotnický prostředek musí mít lokalizaci (SN),
                // tj. jde přidat výhradně přes mapu zubů.
                .filter((p) => !p.mdrDevice && p.kind !== "bridge")
                .map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name} (${formatHalere(p.price)})`,
                }))}
              value={pickerSelection}
              onChange={(v) => {
                if (v) addPickerItem(v);
              }}
              leftSection={<IconPlus size={16} />}
            />
          </Group>
          {items.length === 0 ? (
            <Text size="sm" c="dimmed">{t("Zatím žádné položky.")}</Text>
          ) : isMobile ? (
            /* Mobil: karta na položku, editace pod sebou (bez h-scrollu). */
            <Stack gap={8}>
              {items.map((i) => (
                <Box
                  key={i.key}
                  p="sm"
                  style={{ border: "1px solid light-dark(#f3f4f6, #2a2a2a)", borderRadius: 8 }}
                >
                  <Group justify="space-between" wrap="nowrap" mb={6}>
                    <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                      <Text size="sm" ff="monospace" c="dimmed">{i.code}</Text>
                      <Text size="sm" fw={600}>{i.name}</Text>
                      {i.localization && (
                        <Badge size="sm" variant="light" color="teal">{i.localization}</Badge>
                      )}
                      {i.mdrDevice && (
                        <Badge size="xs" variant="outline" color="teal">ZP</Badge>
                      )}
                    </Group>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      style={{ flexShrink: 0 }}
                      onClick={() => removeItem(i.key)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  <Group gap="xs" wrap="nowrap" align="flex-end">
                    <NumberInput
                      label={t("Počet")}
                      size="xs"
                      min={1}
                      style={{ width: 80 }}
                      value={i.quantity}
                      disabled={Boolean(i.localization)}
                      onChange={(v) => {
                        // prázdný input mid-edit necommitovat (jinak skočí na 1)
                        const n = Number(v);
                        if (v !== "" && Number.isFinite(n) && n >= 1) updateItem(i.key, { quantity: n });
                      }}
                    />
                    <NumberInput
                      label={t("Cena/ks (Kč)")}
                      size="xs"
                      min={0}
                      decimalScale={2}
                      style={{ flex: 1 }}
                      value={halereToKc(i.unitPrice)}
                      onChange={(v) => {
                        // prázdný input necommitovat — smazání pole by tiše uložilo 0 Kč
                        const n = Number(v);
                        if (v !== "" && Number.isFinite(n) && n >= 0) updateItem(i.key, { unitPrice: kcToHalere(n) });
                      }}
                    />
                    <Text size="sm" fw={700} pb={6} style={{ whiteSpace: "nowrap" }}>
                      {formatHalere(i.unitPrice * i.quantity)}
                    </Text>
                  </Group>
                </Box>
              ))}
            </Stack>
          ) : (
            <Box style={{ overflowX: "auto" }}>
              <Table style={{ minWidth: 660 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Kód")}</Table.Th>
                    <Table.Th>{t("Název")}</Table.Th>
                    <Table.Th style={{ width: 110 }}>{t("Lokalizace")}</Table.Th>
                    <Table.Th style={{ width: 90 }}>{t("Počet")}</Table.Th>
                    <Table.Th style={{ width: 130 }}>{t("Cena/ks (Kč)")}</Table.Th>
                    <Table.Th style={{ width: 110, textAlign: "right" }}>{t("Celkem")}</Table.Th>
                    <Table.Th style={{ width: 50 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map((i) => (
                    <Table.Tr key={i.key}>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text size="sm" ff="monospace">{i.code}</Text>
                          {i.mdrDevice && (
                            <Tooltip label={t("Zdravotnický prostředek (MDR)")}>
                              <Badge size="xs" variant="outline" color="teal">ZP</Badge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="sm">{i.name}</Text></Table.Td>
                      <Table.Td>
                        {i.localization ? (
                          <Badge size="sm" variant="light" color="teal">{i.localization}</Badge>
                        ) : (
                          <Text size="sm" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          min={1}
                          value={i.quantity}
                          disabled={Boolean(i.localization)}
                          onChange={(v) => {
                        // prázdný input mid-edit necommitovat (jinak skočí na 1)
                        const n = Number(v);
                        if (v !== "" && Number.isFinite(n) && n >= 1) updateItem(i.key, { quantity: n });
                      }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          min={0}
                          decimalScale={2}
                          value={halereToKc(i.unitPrice)}
                          onChange={(v) => {
                        // prázdný input necommitovat — smazání pole by tiše uložilo 0 Kč
                        const n = Number(v);
                        if (v !== "" && Number.isFinite(n) && n >= 0) updateItem(i.key, { unitPrice: kcToHalere(n) });
                      }}
                        />
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text size="sm" fw={600}>{formatHalere(i.unitPrice * i.quantity)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon variant="subtle" color="red" onClick={() => removeItem(i.key)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          )}
          {items.length > 0 && (
            <>
              <Divider mt="sm" mb={8} />
              {/* pr = šířka sloupce s košem (50) + padding buňky (16),
                  aby částka seděla pod sloupcem Celkem. */}
              <Group justify="flex-end" gap="lg" pr={isMobile ? 0 : 66}>
                <Text size="sm" c="dimmed">{t("Celkem")}</Text>
                <Text size="md" fw={700}>{formatHalere(itemsTotal)}</Text>
              </Group>
            </>
          )}
        </Card>

        {/* -------- Doprava a úprava ceny -------- */}
        <Card withBorder>
          <Title order={4} mb={4}>{t("Doprava a úprava ceny")}</Title>
          <Text size="sm" c="dimmed" mb="md">
            {t("Cena dopravy 0 = klinice se neúčtuje. Úprava ceny: sleva záporně (−200), přirážka kladně.")}
          </Text>
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label={t("Způsob dopravy")}
                clearable
                placeholder={shippingMethods.length ? t("Bez dopravy") : t("Číselník je prázdný (Admin → Doprava)")}
                disabled={loading || shippingMethods.length === 0}
                data={shippingMethods.map((m) => ({ value: m.id, label: m.name }))}
                value={shippingMethodId}
                onChange={(v) => {
                  setShippingMethodId(v);
                  if (!v) setShippingPrice(0);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label={t("Cena dopravy (Kč)")}
                min={0}
                decimalScale={2}
                disabled={loading || !shippingMethodId}
                value={halereToKc(shippingPrice)}
                onChange={(v) => {
                  const n = Number(v);
                  if (v !== "" && Number.isFinite(n) && n >= 0) setShippingPrice(kcToHalere(n));
                  if (v === "") setShippingPrice(0);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label={t("Úprava ceny (Kč)")}
                decimalScale={2}
                disabled={loading}
                value={halereToKc(adjustmentAmount)}
                onChange={(v) => {
                  const n = Number(v);
                  if (v !== "" && Number.isFinite(n)) setAdjustmentAmount(kcToHalere(n));
                  if (v === "") setAdjustmentAmount(0);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label={t("Důvod úpravy")}
                placeholder={t("Např. množstevní sleva, oprava reklamace…")}
                disabled={loading || adjustmentAmount === 0}
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.currentTarget.value)}
              />
            </Grid.Col>
          </Grid>
          {(adjustmentAmount !== 0 || shippingPrice > 0) && (
            <Group justify="flex-end" gap="lg" mt="md">
              <Text size="sm" c="dimmed">{t("K fakturaci celkem")}</Text>
              <Text size="md" fw={700}>
                {formatHalere(itemsTotal + adjustmentAmount + shippingPrice)}
              </Text>
            </Group>
          )}
        </Card>

        {/* -------- Poznámka -------- */}
        <Card withBorder>
          <Title order={4} mb="md">{t("Poznámka k zakázce")}</Title>
          <Textarea
            autosize
            minRows={2}
            disabled={loading}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </Card>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => navigate(backTo)}>
            {t("Zrušit")}
          </Button>
          <Button loading={saving} disabled={loading} onClick={() => void handleSubmit()}>
            {isEdit ? t("Uložit změny") : t("Založit zakázku")}
          </Button>
        </Group>
      </Stack>
    </FormPageShell>
  );
}
