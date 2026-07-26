import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { components } from "@/lib/api-types.gen";
import {
  type PracticeListParams,
  type RegulationListParams,
  securityKeys,
} from "./keys";

export type DataRegulation = components["schemas"]["DataRegulationResult"];
export type DataSafetyPractice =
  components["schemas"]["DataSafetyPracticeResult"];
export type RegulationArticle = components["schemas"]["RegulationArticle"];
export type PracticeSatisfies = components["schemas"]["PracticeSatisfies"];

/**
 * One tab's catalog in one fetch — 12 regulations / ~14 practices against the
 * backend's page-size cap of 100, so a single page always suffices.
 */
export function useDataRegulationsQuery(params: RegulationListParams = {}) {
  return useQuery({
    queryKey: securityKeys.regulationList(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/data-regulations", {
        params: { query: { ...params, page: 1, size: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useDataRegulationQuery(id: string) {
  return useQuery({
    queryKey: securityKeys.regulation(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/data-regulations/{regulation_id}",
        { params: { path: { regulation_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}

export function useDataSafetyPracticesQuery(params: PracticeListParams = {}) {
  return useQuery({
    queryKey: securityKeys.practiceList(params),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/data-safety-practices", {
        params: { query: { ...params, page: 1, size: 100 } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useDataSafetyPracticeQuery(id: string) {
  return useQuery({
    queryKey: securityKeys.practice(id),
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/v1/data-safety-practices/{practice_id}",
        { params: { path: { practice_id: id } } },
      );
      if (error) throw error;
      return data;
    },
    enabled: id !== "",
  });
}
