/**
 * Port of internal/rules/phase_rule_test.go for phaseRules.js.
 * Run with: npm test (from move/)
 */

const {
  PhaseUnknown,
  ConditionTrue,
  ConditionFalse,
  ConditionUnknown,
  conditionEquals,
  conditionsAll,
  conditionsAny,
  newPhaseRule,
} = require('./phaseRules.js');

function cond(ctype, status) {
  return { type: ctype, status };
}

// ---- ContainsAll (ConditionsAll) ----

describe('PhaseRuleAll', () => {
  test('Satisfies_EmptyConditions_RequiresOne', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies(null)).toBe(false);
    expect(rule.satisfies([])).toBe(false);
  });

  test('Satisfies_OneCondition_Matching', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(true);
  });

  test('Satisfies_OneCondition_WrongStatus', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies([cond('A', ConditionFalse)])).toBe(false);
    expect(rule.satisfies([cond('A', ConditionUnknown)])).toBe(false);
  });

  test('Satisfies_OneCondition_Missing', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies([cond('B', ConditionTrue)])).toBe(false);
  });

  test('Satisfies_MultipleConditions_AllMatching', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAll(
        conditionEquals('A', ConditionTrue),
        conditionEquals('B', ConditionTrue),
        conditionEquals('C', ConditionFalse)
      )
    );
    const conds = [
      cond('A', ConditionTrue),
      cond('B', ConditionTrue),
      cond('C', ConditionFalse),
    ];
    expect(rule.satisfies(conds)).toBe(true);
  });

  test('Satisfies_MultipleConditions_OneMissing', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAll(conditionEquals('A', ConditionTrue), conditionEquals('B', ConditionTrue))
    );
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(false);
  });

  test('Satisfies_MultipleConditions_OneWrongStatus', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAll(conditionEquals('A', ConditionTrue), conditionEquals('B', ConditionTrue))
    );
    const conds = [cond('A', ConditionTrue), cond('B', ConditionFalse)];
    expect(rule.satisfies(conds)).toBe(false);
  });

  test('Satisfies_AllowedStatuses_OneMatches', () => {
    const rule = newPhaseRule(
      'Pending',
      conditionsAll(conditionEquals('A', ConditionTrue, ConditionUnknown))
    );
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(true);
    expect(rule.satisfies([cond('A', ConditionUnknown)])).toBe(true);
    expect(rule.satisfies([cond('A', ConditionFalse)])).toBe(false);
  });

  test('Satisfies_ExtraConditions_Ignored', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    const conds = [
      cond('A', ConditionTrue),
      cond('B', ConditionFalse),
      cond('C', ConditionUnknown),
    ];
    expect(rule.satisfies(conds)).toBe(true);
  });

  test('Satisfies_EmptyRule', () => {
    const rule = newPhaseRule('Ready', conditionsAll());
    expect(rule.satisfies(null)).toBe(true);
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(true);
  });

  test('Phase', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.phase()).toBe('Ready');
  });

  test('ComputePhase_Satisfied', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.computePhase([cond('A', ConditionTrue)])).toBe('Ready');
  });

  test('ComputePhase_NotSatisfied', () => {
    const rule = newPhaseRule('Ready', conditionsAll(conditionEquals('A', ConditionTrue)));
    expect(rule.computePhase([cond('A', ConditionFalse)])).toBe(PhaseUnknown);
  });
});

// ---- ContainsAny (ConditionsAny) ----

describe('PhaseRuleAny', () => {
  test('Satisfies_EmptyConditions_RequiresOne', () => {
    const rule = newPhaseRule('Ready', conditionsAny(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies(null)).toBe(false);
    expect(rule.satisfies([])).toBe(false);
  });

  test('Satisfies_OneCondition_Matching', () => {
    const rule = newPhaseRule('Ready', conditionsAny(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(true);
  });

  test('Satisfies_OneCondition_WrongStatus', () => {
    const rule = newPhaseRule('Ready', conditionsAny(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies([cond('A', ConditionFalse)])).toBe(false);
  });

  test('Satisfies_OneCondition_Missing', () => {
    const rule = newPhaseRule('Ready', conditionsAny(conditionEquals('A', ConditionTrue)));
    expect(rule.satisfies([cond('B', ConditionTrue)])).toBe(false);
  });

  test('Satisfies_MultipleConditions_OneMatches', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAny(
        conditionEquals('A', ConditionTrue),
        conditionEquals('B', ConditionTrue),
        conditionEquals('C', ConditionTrue)
      )
    );
    const conds = [
      cond('A', ConditionTrue),
      cond('B', ConditionFalse),
      cond('C', ConditionFalse),
    ];
    expect(rule.satisfies(conds)).toBe(true);
  });

  test('Satisfies_MultipleConditions_NoneMatch', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAny(conditionEquals('A', ConditionTrue), conditionEquals('B', ConditionTrue))
    );
    const conds = [cond('A', ConditionFalse), cond('B', ConditionFalse)];
    expect(rule.satisfies(conds)).toBe(false);
  });

  test('Satisfies_MultipleConditions_AllMatch', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAny(conditionEquals('A', ConditionTrue), conditionEquals('B', ConditionTrue))
    );
    const conds = [cond('A', ConditionTrue), cond('B', ConditionTrue)];
    expect(rule.satisfies(conds)).toBe(true);
  });

  test('Satisfies_AllowedStatuses_OneMatches', () => {
    const rule = newPhaseRule(
      'Pending',
      conditionsAny(conditionEquals('A', ConditionTrue, ConditionUnknown))
    );
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(true);
    expect(rule.satisfies([cond('A', ConditionUnknown)])).toBe(true);
    expect(rule.satisfies([cond('A', ConditionFalse)])).toBe(false);
  });

  test('Satisfies_EmptyRule', () => {
    const rule = newPhaseRule('Ready', conditionsAny());
    expect(rule.satisfies(null)).toBe(false);
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(false);
  });

  test('Phase', () => {
    const rule = newPhaseRule('Failed', conditionsAny(conditionEquals('A', ConditionFalse)));
    expect(rule.phase()).toBe('Failed');
  });

  test('ComputePhase_Satisfied', () => {
    const rule = newPhaseRule('Ready', conditionsAny(conditionEquals('A', ConditionTrue)));
    expect(rule.computePhase([cond('A', ConditionTrue)])).toBe('Ready');
  });

  test('ComputePhase_NotSatisfied', () => {
    const rule = newPhaseRule('Ready', conditionsAny(conditionEquals('A', ConditionTrue)));
    expect(rule.computePhase([cond('A', ConditionFalse)])).toBe(PhaseUnknown);
  });
});

// ---- ConditionEquals multiple statuses (regression for closure capture) ----

describe('conditionEquals', () => {
  test('MultipleStatuses_AllReturnedCorrectly', () => {
    const matchers = conditionEquals('X', ConditionTrue, ConditionFalse, ConditionUnknown);
    expect(matchers).toHaveLength(3);
    const seen = new Set();
    for (const m of matchers) {
      expect(m.condition).toBe('X');
      seen.add(m.status);
    }
    expect(seen.has(ConditionTrue)).toBe(true);
    expect(seen.has(ConditionFalse)).toBe(true);
    expect(seen.has(ConditionUnknown)).toBe(true);
  });
});

// ---- ConditionsAll with multiple matcher groups ----

describe('ConditionsAll', () => {
  test('MultipleMatcherGroups', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAll(
        conditionEquals('A', ConditionTrue),
        conditionEquals('B', ConditionFalse)
      )
    );
    const conds = [cond('A', ConditionTrue), cond('B', ConditionFalse)];
    expect(rule.satisfies(conds)).toBe(true);
  });
});

// ---- ConditionsAny with multiple matcher groups ----

describe('ConditionsAny', () => {
  test('MultipleMatcherGroups', () => {
    const rule = newPhaseRule(
      'Ready',
      conditionsAny(conditionEquals('A', ConditionTrue), conditionEquals('B', ConditionTrue))
    );
    expect(rule.satisfies([cond('A', ConditionTrue)])).toBe(true);
    expect(rule.satisfies([cond('B', ConditionTrue)])).toBe(true);
    expect(
      rule.satisfies([cond('A', ConditionFalse), cond('B', ConditionFalse)])
    ).toBe(false);
  });
});

// ---- PhaseUnknown constant ----

describe('PhaseUnknown', () => {
  test('is Unknown', () => {
    expect(PhaseUnknown).toBe('Unknown');
  });
});

// ---- User scenario: two phases a,b; two conditions c1,c2; rule order and current state ----

const { computePhaseFromRules } = require('./phaseRules.js');

describe('User scenario: a when c1&&c2 True, b when c1 False OR c2 False', () => {
  test('current c1=True c2=True => phase a', () => {
    const ruleA = newPhaseRule(
      'a',
      conditionsAll(conditionEquals('c1', ConditionTrue), conditionEquals('c2', ConditionTrue))
    );
    const ruleB = newPhaseRule(
      'b',
      conditionsAny(conditionEquals('c1', ConditionFalse), conditionEquals('c2', ConditionFalse))
    );
    const rules = [ruleA, ruleB];
    const current = [cond('c1', ConditionTrue), cond('c2', ConditionTrue)];
    expect(computePhaseFromRules(rules, current)).toBe('a');
  });

  test('current c1=False c2=True => phase b', () => {
    const ruleA = newPhaseRule(
      'a',
      conditionsAll(conditionEquals('c1', ConditionTrue), conditionEquals('c2', ConditionTrue))
    );
    const ruleB = newPhaseRule(
      'b',
      conditionsAny(conditionEquals('c1', ConditionFalse), conditionEquals('c2', ConditionFalse))
    );
    const rules = [ruleA, ruleB];
    const current = [cond('c1', ConditionFalse), cond('c2', ConditionTrue)];
    expect(computePhaseFromRules(rules, current)).toBe('b');
  });

  test('current c1=True c2=False => phase b', () => {
    const ruleA = newPhaseRule(
      'a',
      conditionsAll(conditionEquals('c1', ConditionTrue), conditionEquals('c2', ConditionTrue))
    );
    const ruleB = newPhaseRule(
      'b',
      conditionsAny(conditionEquals('c1', ConditionFalse), conditionEquals('c2', ConditionFalse))
    );
    const rules = [ruleA, ruleB];
    const current = [cond('c1', ConditionTrue), cond('c2', ConditionFalse)];
    expect(computePhaseFromRules(rules, current)).toBe('b');
  });
});
