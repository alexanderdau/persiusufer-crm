import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";

const QUERY_KEY = ["kleinanzeigen-favoriten"] as const;

export const useBaugFavoriten = () => {
  const qc = useQueryClient();
  const sb = getSupabaseClient();

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await sb
        .from("kleinanzeigen_favoriten")
        .select("kid");
      if (error) throw error;
      return new Set<number>((data ?? []).map((r: any) => Number(r.kid)));
    },
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: async (kid: number) => {
      const isFav = q.data?.has(kid) ?? false;
      if (isFav) {
        const { error } = await sb
          .from("kleinanzeigen_favoriten")
          .delete()
          .eq("kid", kid);
        if (error) throw error;
      } else {
        const { data: salesId, error: rpcErr } = await sb.rpc("my_sales_id");
        if (rpcErr) throw rpcErr;
        const { error } = await sb
          .from("kleinanzeigen_favoriten")
          .insert({ kid, sales_id: salesId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return {
    favoriten: q.data ?? new Set<number>(),
    isFavorit: (kid: number) => q.data?.has(kid) ?? false,
    toggle: (kid: number) => toggle.mutate(kid),
    isLoading: q.isPending,
    isToggling: toggle.isPending,
  };
};
