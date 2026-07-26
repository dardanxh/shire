import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import architectures from "@/features/architectures/locales/en.json";
import briefing from "@/features/briefing/locales/en.json";
import compliance from "@/features/compliance/locales/en.json";
import connectors from "@/features/connectors/locales/en.json";
import council from "@/features/council/locales/en.json";
import hobits from "@/features/hobits/locales/en.json";
import home from "@/features/home/locales/en.json";
import jobs from "@/features/jobs/locales/en.json";
import members from "@/features/members/locales/en.json";
import mergeReviews from "@/features/merge-reviews/locales/en.json";
import modelling from "@/features/modelling/locales/en.json";
import news from "@/features/news/locales/en.json";
import principles from "@/features/principles/locales/en.json";
import qualities from "@/features/qualities/locales/en.json";
import readiness from "@/features/readiness/locales/en.json";
import repositories from "@/features/repositories/locales/en.json";
import roadmaps from "@/features/roadmaps/locales/en.json";
import security from "@/features/security/locales/en.json";
import sizing from "@/features/sizing/locales/en.json";
import techchoice from "@/features/techchoice/locales/en.json";
import technologies from "@/features/technologies/locales/en.json";
import tools from "@/features/tools/locales/en.json";
import common from "@/locales/common/en.json";

/**
 * Single default namespace. Feature dictionaries are top-level-namespaced
 * (`repositories.*`, `tools.*`, `common.*`) and merged here, so keys stay
 * dot-namespaced and collision-free.
 */
const en = {
  ...common,
  ...repositories,
  ...tools,
  ...connectors,
  ...members,
  ...mergeReviews,
  ...hobits,
  ...home,
  ...briefing,
  ...jobs,
  ...principles,
  ...news,
  ...roadmaps,
  ...council,
  ...architectures,
  ...technologies,
  ...modelling,
  ...security,
  ...qualities,
  ...readiness,
  ...sizing,
  ...techchoice,
  ...compliance,
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
