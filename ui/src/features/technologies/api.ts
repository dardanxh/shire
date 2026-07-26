import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import { type TechnologyListParams, technologyKeys } from "./keys";

/** Rows fetched per infinite-scroll page of the corpus browse grid. */
const PAGE_SIZE = 24;

export type Technology = components["schemas"]["TechnologyResult"];
export type CreateTechnology = components["schemas"]["CreateTechnology"];
export type UpdateTechnology = components["schemas"]["UpdateTechnology"];
export type TechCategory = components["schemas"]["TechCategoryResult"];
export type TechCategoryTree = components["schemas"]["TechCategoryTreeResult"];
export type CreateTechCategory = components["schemas"]["CreateTechCategory"];
export type UpdateTechCategory = components["schemas"]["UpdateTechCategory"];

/**
 * The corpus browse grid: server-paginated, fetched incrementally as the user scrolls.
 * `params` carries only the filters; pages are managed in memory by react-query.
 */
export function useInfiniteTechnologiesQuery(params: TechnologyListParams) {
  return useInfiniteQuery({
    queryKey: technologyKeys.infinite(params),
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET("/api/v1/technologies", {
        params: { query: { ...params, page: pageParam, size: PAGE_SIZE } },
      });
      if (error) throw error;
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
  });
}

/** The unfiltered corpus size — for the "N of TOTAL" counter next to the search. */
export function useTechnologyTotalQuery() {
  return useQuery({
    queryKey: [...technologyKeys.all, "total"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/technologies", {
        params: { query: { page: 1, size: 1 } },
      });
      if (error) throw error;
      return data.total;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Count of starred technologies — drives the Starred tab badge. */
export function useStarredTechnologyTotalQuery() {
  return useQuery({
    queryKey: [...technologyKeys.all, "starred-total"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/technologies", {
        params: { query: { page: 1, size: 1, starred: true } },
      });
      if (error) throw error;
      return data.total;
    },
  });
}

export type TechnologyBlueprintRef =
  components["schemas"]["TechnologyBlueprintRef"];

/** Architecture blueprints whose stages recommend or list this technology. */
export function useTechnologyBlueprintsQuery(id: string) {
  return useQuery({
    queryKey: [...technologyKeys.detail(id), "blueprints"],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/technologies/{technology_id}/blueprints",
        { params: { path: { technology_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useTechnologyQuery(id: string) {
  return useQuery({
    queryKey: technologyKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/technologies/{technology_id}",
        { params: { path: { technology_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useTechnologyCategoriesQuery() {
  return useQuery({
    queryKey: technologyKeys.categories(),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/technology-categories");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * The full corpus as one cached flat list (for id → name/category resolution
 * and stack pickers). The backend caps page size at 100, so pages are fetched
 * sequentially until exhausted.
 */
export function useTechnologyCorpusQuery() {
  return useQuery({
    queryKey: technologyKeys.corpus(),
    queryFn: async () => {
      const items: Technology[] = [];
      let page = 1;
      for (;;) {
        const { data, error } = await api.GET("/api/v1/technologies", {
          params: { query: { page, size: 100 } },
        });
        if (error) throw error;
        items.push(...data.items);
        if (page >= data.pages) break;
        page += 1;
      }
      return items;
    },
  });
}

export function useCreateTechnologyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTechnology) => {
      const { data, error } = await api.POST("/api/v1/technologies", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: technologyKeys.all });
    },
  });
}

export function useUpdateTechnologyMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateTechnology) => {
      const { data, error } = await api.PATCH(
        "/api/v1/technologies/{technology_id}",
        { params: { path: { technology_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: technologyKeys.all });
    },
  });
}

export function useDeleteTechnologyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE(
        "/api/v1/technologies/{technology_id}",
        { params: { path: { technology_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: technologyKeys.all });
    },
  });
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTechCategory) => {
      const { data, error } = await api.POST("/api/v1/technology-categories", {
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: technologyKeys.all });
    },
  });
}

export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateTechCategory;
    }) => {
      const { data, error } = await api.PATCH(
        "/api/v1/technology-categories/{category_id}",
        { params: { path: { category_id: id } }, body },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: technologyKeys.all });
    },
  });
}

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE(
        "/api/v1/technology-categories/{category_id}",
        { params: { path: { category_id: id } } },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: technologyKeys.all });
    },
  });
}
