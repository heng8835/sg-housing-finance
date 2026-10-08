// Modelling defaults for the CPF projection (not rules — editable in the Plan tab's CPF section, stored as
// null = "use the default"). Shared by the Plan tab and the scenario compare table so both use the same values.

export const DEFAULT_WAGE_GROWTH = 0.03;
export const DEFAULT_BONUS_MONTHS = 1;
export const CPF_DEFAULTS = Object.freeze({ wageGrowth: DEFAULT_WAGE_GROWTH, bonusMonths: DEFAULT_BONUS_MONTHS });
