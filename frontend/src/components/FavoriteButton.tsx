import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

type FavoriteButtonProps = {
  type: "team" | "player";
  id: string | number;
  initialFavorite?: boolean;
};

export function FavoriteButton({ type, id, initialFavorite = false }: FavoriteButtonProps) {
  const queryClient = useQueryClient();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);

  useEffect(() => {
    setIsFavorite(initialFavorite);
  }, [initialFavorite]);

  const favorite = useMutation({
    mutationFn: (next: boolean) => api.setFavorite(type, id, next),
    onMutate: (next) => setIsFavorite(next),
    onError: (error) => {
      setIsFavorite((current) => !current);
      if (error.message.toLowerCase().includes("login")) {
        window.location.href = "/login";
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: [type, String(id)] });
    },
  });

  const label = isFavorite ? `Remove favorite ${type}` : `Favorite ${type}`;

  return (
    <button
      type="button"
      onClick={() => favorite.mutate(!isFavorite)}
      disabled={favorite.isPending}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
        isFavorite
          ? "border-brass/40 bg-[#fff7ea] text-ink hover:bg-[#ffefd1]"
          : "border-line bg-white text-graphite hover:text-ink"
      } disabled:cursor-not-allowed disabled:opacity-60`}
      aria-pressed={isFavorite}
      title={label}
    >
      <Star size={16} className={isFavorite ? "fill-brass text-brass" : "text-court"} />
      {isFavorite ? "Favorited" : "Favorite"}
    </button>
  );
}
