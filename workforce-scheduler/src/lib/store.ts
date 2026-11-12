import { supabase } from "./supabase";

export type CurrentStore = {
  id: string;
  store_name: string;
  store_number: string | null;
  public_slug: string;
};

export async function getCurrentStore(): Promise<CurrentStore> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Manager authentication required.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("store_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.store_id) {
    throw new Error(
      profileError?.message || "No store workspace is assigned to this account.",
    );
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, store_name, store_number, public_slug")
    .eq("id", profile.store_id)
    .single();

  if (storeError || !store) {
    throw new Error(storeError?.message || "Unable to load your store workspace.");
  }

  return store as CurrentStore;
}
