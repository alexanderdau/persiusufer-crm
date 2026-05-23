import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";

const QUERY_KEY = ["zvg-akte-favoriten"] as const;

export const useFavoriten = () => {
  const qc = useQueryClient();
  const sb = getSupabaseClient();

  const q = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await sb
        .from("zvg_akte_favoriten")
        .select("zid");
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: any) => r.zid));
    },
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: async (zid: string) => {
      const isFav = q.data?.has(zid) ?? false;
      if (isFav) {
        const { error } = await sb
          .from("zvg_akte_favoriten")
          .delete()
          .eq("zid", zid);
        if (error) throw error;
      } else {
        const { data: salesId, error: rpcErr } = await sb.rpc("my_sales_id");
        if (rpcErr) throw rpcErr;
        const { error } = await sb
          .from("zvg_akte_favoriten")
          .insert({ zid, sales_id: salesId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return {
    favoriten: q.data ?? new Set<string>(),
    isFavorit: (zid: string) => q.data?.has(zid) ?? false,
    toggle: (zid: string) => toggle.mutate(zid),
    isLoading: q.isPending,
    isToggling: toggle.isPending,
  };
};
