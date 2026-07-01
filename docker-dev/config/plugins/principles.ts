import type { Plugin } from "@opencode-ai/plugin"

/**
 * Principles Plugin — inyecta principios de diseño (DRY, KISS, YAGNI)
 * en el system prompt de TODAS las sesiones (orquestador + subagentes).
 *
 * Hook: experimental.chat.system.transform
 *   Se dispara cuando OpenCode construye el system prompt para cualquier
 *   sesión. Appendamos principios al array output.system.
 *
 * Efecto:
 *   - El LLM escribe código con DRY/KISS/YAGNI como guía constante
 *   - Aplica a orquestador, explore, librarian, fixer, oracle, designer...
 *   - No bloquea, no modifica prompts existentes
 */
export const PrinciplesPlugin: Plugin = async () => {
  console.log("[principles] Plugin loaded — injecting DRY, KISS, YAGNI")

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      output.system.push([
        "<design_principles>",
        "",
        "DRY (Don't Repeat Yourself):",
        "- Cada pieza de conocimiento tiene una representación única, no ambigua.",
        "- Si ves código duplicado, extraé a una función/constante/abstracción.",
        "- No copies y pegues lógica — abstract.",
        "",
        "KISS (Keep It Simple, Stupid):",
        "- La solución más simple que funciona es la mejor.",
        "- No agregues complejidad anticipada. YAGNI applies.",
        "- Código claro > código clever. Legibilidad > ingenio.",
        "- Si una función crece, dividila. Si un componente es confuso, simplificalo.",
        "",
        "YAGNI (You Ain't Gonna Need It):",
        "- No agregues funcionalidad hasta que sea estrictamente necesaria.",
        "- Cada línea de código es un pasivo (mantenimiento, bugs, deuda técnica).",
        "- Preguntá: ¿resuelve el problema AHORA? Si no, no lo escribas.",
        "",
        "Consistencia > Novedad:",
        "- Seguí los patrones existentes del código base.",
        "- No introduzcas nuevos estilos, abstracciones o patrones sin necesidad.",
        "- Preferí la convención establecida sobre la innovación arbitraria.",
        "",
        "</design_principles>",
      ].join("\n"))
    },
  }
}
