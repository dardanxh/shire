import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import connectors from "@/features/connectors/locales/en.json";
import members from "@/features/members/locales/en.json";
import repositories from "@/features/repositories/locales/en.json";
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
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
