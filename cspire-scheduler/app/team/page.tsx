"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { getCurrentStore } from "../../src/lib/store";

type Member = { id: string; name: string | null; email: string | null; role: string | null };
type Invite = { id: string; email: string; role: string; invite_code: string; expires_at: string; used_at: string | null };

export default function StoreTeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [membersResult, invitesResult] = await Promise.all([
      supabase.from("profiles").select("id,name,email,role").order("created_at"),
      supabase.from("store_invites").select("id,email,role,invite_code,expires_at,used_at").order("created_at", { ascending: false }),
    ]);
    if (membersResult.error || invitesResult.error) setError((membersResult.error || invitesResult.error)?.message || "Unable to load team.");
    else {
      setMembers((membersResult.data as Member[]) || []);
      setInvites((invitesResult.data as Invite[]) || []);
    }
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    const store = await getCurrentStore();
    const { data: userData } = await supabase.auth.getUser();
    const code = crypto.randomUUID().replaceAll("-", "");
    const { error: inviteError } = await supabase.from("store_invites").insert({
      store_id: store.id, email: email.trim().toLowerCase(), role, invite_code: code, created_by: userData.user?.id,
    });
    setSaving(false);
    if (inviteError) return setError(inviteError.message);
    const link = `${window.location.origin}/login?invite=${code}`;
    await navigator.clipboard?.writeText(link);
    setMessage(`Invite link copied for ${email}. It expires in 7 days.`);
    setEmail("");
    await load();
  }

  async function copyInvite(invite: Invite) {
    await navigator.clipboard.writeText(`${window.location.origin}/login?invite=${invite.invite_code}`);
    setMessage("Invite link copied.");
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-4xl font-bold">Store Team</h1><p className="mt-1 text-slate-600">Invite managers or view-only teammates to this store.</p></div>
      {message && <div className="rounded-lg bg-green-50 p-3 text-green-800">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-red-800">{error}</div>}
      <form onSubmit={createInvite} className="grid gap-4 rounded-xl bg-white p-6 shadow md:grid-cols-[1fr_220px_auto] md:items-end">
        <label><span className="text-sm font-medium">Email address</span><input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" /></label>
        <label><span className="text-sm font-medium">Role</span><select value={role} onChange={(e)=>setRole(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3"><option value="manager">Manager — can edit</option><option value="viewer">View only</option></select></label>
        <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Creating…" : "Create Invite"}</button>
      </form>
      <section className="rounded-xl bg-white p-6 shadow"><h2 className="text-2xl font-bold">Current members</h2><div className="mt-4 divide-y">{members.map(member=><div key={member.id} className="flex items-center justify-between py-3"><div><p className="font-semibold">{member.name || member.email}</p><p className="text-sm text-slate-500">{member.email}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold capitalize">{member.role}</span></div>)}</div></section>
      <section className="rounded-xl bg-white p-6 shadow"><h2 className="text-2xl font-bold">Invitations</h2><div className="mt-4 divide-y">{invites.length ? invites.map(invite=><div key={invite.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{invite.email}</p><p className="text-sm text-slate-500 capitalize">{invite.role} · {invite.used_at ? "Accepted" : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`}</p></div>{!invite.used_at && <button onClick={()=>void copyInvite(invite)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Copy Link</button>}</div>) : <p className="py-4 text-slate-500">No invitations yet.</p>}</div></section>
    </div>
  );
}
