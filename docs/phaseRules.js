/**
 * Phase rules: compute a resource phase from Kubernetes-style conditions.
 * Rewrite of move/rules/phase_rule.go (no tests).
 *
 * Conditions are objects with { type, status } (Kubernetes JSON: type, status).
 * status is one of 'True', 'False', 'Unknown'.
 */

const PhaseUnknown = 'Unknown';

/** Kubernetes condition status values (use only these for status). */
const ConditionTrue = 'True';
const ConditionFalse = 'False';
const ConditionUnknown = 'Unknown';

/** @typedef {'True'|'False'|'Unknown'} ConditionStatus */
/** @typedef {{ type: string, status: ConditionStatus }} Condition */
/** @typedef {{ condition: string, status: ConditionStatus }} ConditionMatcher */

/**
 * Builds matchers for one condition type that may equal any of the given statuses.
 * @param {string} condition - Condition type (e.g. 'BucketExists')
 * @param {...ConditionStatus} statuses - Allowed statuses
 * @returns {ConditionMatcher[]}
 */
function conditionEquals(condition, ...statuses) {
  return statuses.map((status) => ({ condition, status }));
}

/**
 * Flatten matcher lists into one array.
 * @param {boolean} all - If true, all matchers must match (AND); if false, any (OR)
 * @param {...ConditionMatcher[][]} matcherLists
 * @returns {{ matchers: ConditionMatcher[], all: boolean }}
 */
function conditions(all, ...matcherLists) {
  const matchers = matcherLists.flat();
  return { matchers, all };
}

/**
 * All of the given condition matchers must match (AND).
 * @param {...ConditionMatcher[]} matcherLists
 * @returns {{ matchers: ConditionMatcher[], all: true }}
 */
function conditionsAll(...matcherLists) {
  return conditions(true, ...matcherLists);
}

/**
 * At least one of the given condition matchers must match (OR).
 * @param {...ConditionMatcher[]} matcherLists
 * @returns {{ matchers: ConditionMatcher[], all: false }}
 */
function conditionsAny(...matcherLists) {
  return conditions(false, ...matcherLists);
}

/**
 * Build condition type -> allowed statuses map from a matcher.
 * @param {{ matchers: ConditionMatcher[], all: boolean }} matcher
 * @returns {Map<string, ConditionStatus[]>}
 */
function buildConditionMap(matcher) {
  const map = new Map();
  for (const { condition, status } of matcher.matchers) {
    if (!map.has(condition)) {
      map.set(condition, []);
    }
    map.get(condition).push(status);
  }
  return map;
}

/**
 * Create a phase rule. First matching rule in a list gives the phase.
 * @param {string} phase - Phase name (e.g. 'Ready', 'Failed')
 * @param {{ matchers: ConditionMatcher[], all: boolean }} matcher - From conditionsAll() or conditionsAny()
 * @returns {{ satisfies: (conditions: Condition[]) => boolean, phase: () => string, computePhase: (conditions: Condition[]) => string }}
 */
function newPhaseRule(phase, matcher) {
  const conditionToStatusMap = buildConditionMap(matcher);
  const all = matcher.all;

  function satisfies(conditions) {
    // Empty All rule satisfies any conditions; empty Any rule satisfies none
    if (conditionToStatusMap.size === 0) {
      return all;
    }
    if (conditions == null || conditions.length === 0) {
      return false; // rule has requirements but no conditions provided
    }
    const current = new Map();
    for (const c of conditions) {
      const type = c.type ?? c.Type;
      const status = c.status ?? c.Status;
      if (type != null && status != null) current.set(type, status);
    }

    if (all) {
      for (const [requiredType, allowedStatuses] of conditionToStatusMap) {
        const currentStatus = current.get(requiredType);
        if (currentStatus === undefined) return false;
        if (!allowedStatuses.includes(currentStatus)) return false;
      }
      return true;
    }

    for (const c of conditions) {
      const type = c.type ?? c.Type;
      const status = c.status ?? c.Status;
      const allowedStatuses = conditionToStatusMap.get(type);
      if (allowedStatuses?.includes(status)) return true;
    }
    return false;
  }

  function getPhase() {
    return phase;
  }

  function computePhase(conditions) {
    return satisfies(conditions) ? phase : PhaseUnknown;
  }

  return { satisfies, phase: getPhase, computePhase };
}

/**
 * Compute phase from a list of rules (first satisfied rule wins).
 * @param {ReturnType<typeof newPhaseRule>[]} rules
 * @param {Condition[]} conditions
 * @returns {string}
 */
function computePhaseFromRules(rules, conditions) {
  for (const rule of rules) {
    if (rule.satisfies(conditions)) {
      return rule.phase();
    }
  }
  return PhaseUnknown;
}

const api = {
  PhaseUnknown,
  ConditionTrue,
  ConditionFalse,
  ConditionUnknown,
  conditionEquals,
  conditionsAll,
  conditionsAny,
  newPhaseRule,
  computePhaseFromRules,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.phaseRules = api;
}
