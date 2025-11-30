// Load Supabase client
const SUPABASE_URL = "https://arrioucbvflmxqpnjwqx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycmlvdWNidmZsbXhxcG5qd3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NzY0ODQsImV4cCI6MjA4MDA1MjQ4NH0.7Cv-mWZ0yK4t8s_B2Ir03LF4jaBUAIeXiGUjigxWYdY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================
   SHIPMENTS FUNCTIONS
================================ */

// INSERT shipment
async function saveShipment(data) {
  const { error } = await supabase.from("shipments").insert([data]);
  if (error) {
    console.error("Error saving shipment:", error);
    return { success: false, error };
  }
  return { success: true };
}

// GET all shipments
async function fetchShipments() {
  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching shipments:", error);
    return [];
  }
  return data;
}

/* ================================
   INSPECTIONS FUNCTIONS
================================ */

// INSERT inspection
async function saveInspection(data) {
  const { error } = await supabase.from("inspections").insert([data]);
  if (error) {
    console.error("Error saving inspection:", error);
    return { success: false, error };
  }
  return { success: true };
}

// GET inspections by shipmentId
async function fetchInspectionsByShipmentId(shipmentId) {
  const { data, error } = await supabase
    .from("inspections")
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("inspect_date", { ascending: false });

  if (error) {
    console.error("Error fetching inspections:", error);
    return [];
  }
  return data;
}

// GET all inspections
async function fetchAllInspections() {
  const { data, error } = await supabase
    .from("inspections")
    .select("*")
    .order("inspect_date", { ascending: false });

  if (error) {
    console.error("Error fetching all inspections:", error);
    return [];
  }
  return data;
}
