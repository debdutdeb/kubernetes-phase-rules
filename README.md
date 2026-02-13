# Kubernetes Phase Rules

Standalone **phase rules** and **condition matchers** for computing a resource phase from a list of Kubernetes-style conditions (`metav1.Condition`). Extracted from [airlock](https://github.com/RocketChat/airlock).

**Note:** This is an **experimental** module. It is intentionally kept as simple as possible: minimal API surface, no extra dependencies beyond what’s needed for rules and status patching, and no feature creep. Use it as a starting point and adapt as needed. It may (most likely will) be incomplete.

## Why conditions matter

In Kubernetes, **status** holds the *observed* state of a resource, while **spec** holds the *desired* state. Controllers report what they observe via **conditions**: type + status pairs (e.g. `Ready=True`, `Scheduled=False`) with optional reason and message. Conditions give operators and tooling a consistent, machine-readable view of resource health and progress. The community has standardized on `metav1.Condition` and a common `.status.conditions` schema so that UIs, automation, and other controllers can rely on a uniform shape—see [KEP-1623: Standardize Conditions](https://github.com/kubernetes/enhancements/tree/master/keps/sig-api-machinery/1623-standardize-conditions) and the [Kubernetes API conventions (spec and status)](https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status). Projects under [kubernetes-sigs](https://github.com/kubernetes-sigs) (e.g. [Cluster API conditions](https://pkg.go.dev/sigs.k8s.io/cluster-api/util/conditions), [Gateway API status design](https://gateway-api.sigs.k8s.io/geps/gep-1364/)) follow and extend these patterns.

## Conditions and phases

**Conditions** are the source of truth: each one encodes a single observation (type, status, reason, message). A **phase** is a higher-level, human-friendly label (e.g. `Ready`, `Failed`, `Pending`) that summarizes the overall state. The relationship is one-way: phase is *derived* from the current set of conditions. You define **phase rules** that say “when these conditions hold, the phase is X.” Given a list of rules evaluated in order, the first rule whose condition matcher matches the current conditions determines the phase; if none match, the phase is `Unknown`. So conditions drive phase—never the other way around—and the same condition set always yields the same phase for a given rule list.

## Phase for observability

Conditions are granular and precise; phase is a **single, stable label** that answers “what state is this resource in?” That makes phase essential for **observability**:

- **Dashboards and UIs** — Lists and tables can show phase as a column (e.g. `Running`, `Failed`, `Pending`) without parsing multiple conditions. Users and operators get at-a-glance status.
- **Filtering and queries** — “Show all backups in `Failed`” or “alert when phase is not `Ready`” are simple once phase is a first-class field. Doing the same from raw conditions would require reimplementing your rule logic in every consumer.
- **Alerting and SLOs** — Prometheus, Grafana, or custom controllers can target phase for rules (e.g. count resources by phase, alert on `Failed`). A single field keeps alert definitions consistent and avoids drift from condition logic.
- **Consistency across resources** — Different CRs can use different condition types but expose a common phase vocabulary (e.g. `Ready` / `NotReady`), so tooling and runbooks can treat them uniformly.

Without a dedicated phase, every dashboard, CLI, or alert would need to know and duplicate the condition→phase rules. Phase is the **observability contract**: one field that reflects the outcome of your phase rules so the rest of the stack can observe and act on it.

## Why a declarative approach to phase computation

Instead of imperatively setting phase in code (“if store missing then phase = Failed”), you **declare** rules: “phase is Failed when condition A is True or B is True.” Benefits:

- **Single source of truth** — Controllers only write conditions; phase is computed from them. No risk of phase and conditions getting out of sync.
- **Testable** — Rules are pure functions over `[]metav1.Condition`; you can unit-test phase logic without running a controller.
- **Consistent** — Aligns with Kubernetes’ status conventions (observed state in status, [common definitions](https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/status/)) and with how kubernetes-sigs projects structure status and conditions.
- **Clear semantics** — Rule order defines priority (e.g. Completed before Running before Failed); the first match wins, so behavior is easy to reason about and document.

This library provides the rule types and matchers for that declarative phase computation, plus a **StatusManager** that keeps conditions and phase in sync and patches status for you.

---

This program has no CLI behavior: `main()` does nothing. Use **`go test`** to run the test suite.

```bash
go test ./...
```

## Overview

- **Conditions** are type + status pairs (e.g. `BucketExists=True`, `JobFailed=False`).
- A **phase rule** binds a **phase name** (e.g. `Ready`, `Failed`, `Pending`) to a **matcher** over conditions.
- **Condition matchers** are built with `ConditionsAll` (every condition must match) or `ConditionsAny` (at least one must match), and `ConditionEquals(conditionType, statuses...)` to specify allowed statuses per condition.

Given a slice of `[]metav1.Condition`, you can:

1. Ask a single rule whether it **Satisfies** those conditions.
2. Get the rule’s **Phase** name.
3. **ComputePhase**: if the rule is satisfied, return that phase; otherwise return `PhaseUnknown` (`"Unknown"`).

When evaluating multiple rules (e.g. a list of `PhaseRule`), check them in order; the first satisfied rule gives the current phase.

## API (package `rules`)

- **`PhaseRule`**  
  - `Satisfies(conditions []metav1.Condition) bool`  
  - `Phase() string`  
  - `ComputePhase(conditions []metav1.Condition) string`

- **`PhaseUnknown`**  
  Constant `"Unknown"` returned by `ComputePhase` when the rule is not satisfied.

- **`NewPhaseRule(phase string, matcher conditionMatcher) PhaseRule`**  
  Builds a phase rule from a phase name and a condition matcher.

- **`ConditionsAll(matchers ...[]ConditionEqualsMatcher) conditionMatcher`**  
  All of the given condition matchers must match (AND).

- **`ConditionsAny(matchers ...[]ConditionEqualsMatcher) conditionMatcher`**  
  At least one of the given condition matchers must match (OR).

- **`ConditionEquals(condition string, statuses ...metav1.ConditionStatus) []ConditionEqualsMatcher`**  
  Matchers for one condition type that may equal any one of the given statuses (`metav1.ConditionTrue`, `ConditionFalse`, `ConditionUnknown`).

## StatusManager (package `conditions`)

**StatusManager** keeps a custom resource’s status conditions and phase in sync: you hand it a pointer to the CR’s condition slice, the CR itself (as **Object2**), and the phase rules for that resource type. Whenever you set a condition, it updates the in-memory conditions, recomputes the phase from the first matching rule, updates the object’s phase and observed generation, and—if anything changed—persists status with `client.Status().Patch(ctx, object, client.MergeFrom(base))` via the **status client** you passed in. So the controller only calls `SetCondition` / `SetConditions`; StatusManager handles phase and the status patch.

### How airlock uses it

- **Setup**  
  The reconciler is the **status client** (controller-runtime `Client` implements `client.StatusClient`). In `Reconcile`, the controller creates a manager once per reconcile (or reuses a field) with the CR’s status conditions, the CR pointer, and the resource’s phase rules, e.g.  
  `conditions.NewManager(r, &backup.Status.Conditions, &backup, airlockv1alpha1.BackupPhaseRules)`.

- **Fresh resources**  
  When the resource has no observed generation yet, the controller calls **SetConditions** once with a slice of initial conditions (e.g. all `Unknown` with a “not started” reason/message). That establishes the initial condition set and phase and patches status.

- **During reconcile**  
  The controller calls **SetCondition** whenever it learns something (e.g. store not found → `SetCondition(..., ConditionFalse, reason, msg)`, store ready → `SetCondition(..., ConditionTrue, ...)`). Each call uses `meta.SetStatusCondition`; if the condition actually changes, StatusManager recomputes phase from the rules (first match wins), sets phase and observed generation on the object, and performs the status patch. If nothing changed, it does not patch. Logging is done inside the package with `log.FromContext(ctx)` when a condition is updated.

- **Rule order**  
  Phase rules are evaluated in order (e.g. Completed before Running before Failed before Pending). The first rule whose conditions are satisfied sets the phase; if none match, phase becomes `PhaseUnknown`.

### API

- **`Object2`** (interface, defined in this package)  
  Embeds `client.Object` and adds:  
  `SetPhase(phase string)`, `GetPhase() string`, `SetObservedGeneration(generation int64)`.  
  Your CR type (e.g. `MongoDBBackup`, `MongoDBBackupStore`) implements this so the manager can read/write phase and observed generation and use the object as the target of the status patch.

- **`NewManager(statusClient client.StatusClient, conditions *[]metav1.Condition, object Object2, rules []rules.PhaseRule) *StatusManager`**  
  - **statusClient**: typically the reconciler `r` (controller-runtime `Client`).  
  - **conditions**: pointer to the CR’s status condition slice (e.g. `&backup.Status.Conditions`).  
  - **object**: the CR implementing Object2 (e.g. `&backup`).  
  - **rules**: the phase rules for this resource type (e.g. `BackupPhaseRules`).

- **`(m *StatusManager) SetConditions(ctx context.Context, conditions []Condition) error`**  
  Sets multiple conditions in one go (e.g. initial state when `Status.ObservedGeneration == nil`). For each condition, updates the slice with `meta.SetStatusCondition`. If any condition changed, recomputes phase, updates the object’s phase and observed generation, and patches status.

- **`(m *StatusManager) SetCondition(ctx context.Context, conditionType string, status metav1.ConditionStatus, reason, message string) error`**  
  Sets one condition. If it actually changes, recomputes phase, updates phase and observed generation, and patches status. Used throughout the reconcile loop as the controller discovers state.

- **`Condition`** (struct for input)  
  **Type**, **Status**, **Reason**, **Message** — the usual Kubernetes condition fields (LastTransitionTime and ObservedGeneration are set by the manager).

## Examples (from airlock)

### Backup store: Ready vs NotReady

Store is **Ready** if bucket exists; otherwise **NotReady**:

```go
import (
	"github.com/debdutdeb/kubernetes-phase-rules/rules"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	StoreConditionBucketExists = "BucketExists"
	StorePhaseNotReady         = "NotReady"
	StorePhaseReady            = "Ready"
)

var StorePhaseRules = []rules.PhaseRule{
	rules.NewPhaseRule(
		StorePhaseReady,
		rules.ConditionsAny(
			rules.ConditionEquals(StoreConditionBucketExists, metav1.ConditionTrue),
		),
	),
	rules.NewPhaseRule(
		StorePhaseNotReady,
		rules.ConditionsAny(
			rules.ConditionEquals(StoreConditionBucketExists, metav1.ConditionFalse, metav1.ConditionUnknown),
		),
	),
}

// Compute current phase from conditions (check first matching rule)
func phaseFromConditions(conditions []metav1.Condition) string {
	for _, rule := range StorePhaseRules {
		if rule.Satisfies(conditions) {
			return rule.Phase()
		}
	}
	return rules.PhaseUnknown
}
```

### Backup schedule: Running, Failed, Pending

Running when store is ready and nothing has failed; Failed when creation or schedule failed; Pending when store or outcomes are still unknown:

```go
const (
	BackupSchedulePhaseRunning = "Running"
	BackupSchedulePhasePending = "Pending"
	BackupSchedulePhaseFailed  = "Failed"

	BackupScheduleConditionBucketStoreReady           = "BucketStoreReady"
	BackupScheduleConditionBackupCreateFailed         = "BackupCreateFailed"
	BackupScheduleConditionInternalTaskScheduleFailed = "InternalTaskScheduleFailed"
)

var BackupSchedulePhaseRules = []rules.PhaseRule{
	// Running: store ready, no failures
	rules.NewPhaseRule(
		BackupSchedulePhaseRunning,
		rules.ConditionsAll(
			rules.ConditionEquals(BackupScheduleConditionBucketStoreReady, metav1.ConditionTrue),
			rules.ConditionEquals(BackupScheduleConditionBackupCreateFailed, metav1.ConditionFalse),
			rules.ConditionEquals(BackupScheduleConditionInternalTaskScheduleFailed, metav1.ConditionFalse),
		),
	),
	// Failed: creation or schedule failed
	rules.NewPhaseRule(
		BackupSchedulePhaseFailed,
		rules.ConditionsAny(
			rules.ConditionEquals(BackupScheduleConditionBackupCreateFailed, metav1.ConditionTrue),
			rules.ConditionEquals(BackupScheduleConditionInternalTaskScheduleFailed, metav1.ConditionTrue),
		),
	),
	// Pending: store not ready or outcomes unknown
	rules.NewPhaseRule(
		BackupSchedulePhasePending,
		rules.ConditionsAny(
			rules.ConditionEquals(BackupScheduleConditionBucketStoreReady, metav1.ConditionUnknown, metav1.ConditionFalse),
			rules.ConditionEquals(BackupScheduleConditionBackupCreateFailed, metav1.ConditionUnknown),
			rules.ConditionEquals(BackupScheduleConditionInternalTaskScheduleFailed, metav1.ConditionUnknown),
		),
	),
}
```

### Backup: Completed, Running, Failed, Pending

More conditions; order of rules matters (e.g. Completed before Running before Failed before Pending):

```go
const (
	BackupConditionBucketStoreReady   = "BucketStoreReady"
	BackupConditionAccessRequestReady = "MongoDBAccessRequestReady"
	BackupConditionJobScheduled       = "JobScheduled"
	BackupConditionJobCompleted       = "JobCompleted"
	BackupConditionJobFailed          = "JobFailed"

	BackupPhasePending   = "Pending"
	BackupPhaseRunning   = "Running"
	BackupPhaseCompleted = "Completed"
	BackupPhaseFailed    = "Failed"
)

var BackupPhaseRules = []rules.PhaseRule{
	// Completed: store ready, access ready, job completed
	rules.NewPhaseRule(
		BackupPhaseCompleted,
		rules.ConditionsAll(
			rules.ConditionEquals(BackupConditionBucketStoreReady, metav1.ConditionTrue),
			rules.ConditionEquals(BackupConditionAccessRequestReady, metav1.ConditionTrue),
			rules.ConditionEquals(BackupConditionJobCompleted, metav1.ConditionTrue),
		),
	),
	// Running: store ready, access ready, job scheduled
	rules.NewPhaseRule(
		BackupPhaseRunning,
		rules.ConditionsAll(
			rules.ConditionEquals(BackupConditionBucketStoreReady, metav1.ConditionTrue),
			rules.ConditionEquals(BackupConditionAccessRequestReady, metav1.ConditionTrue),
			rules.ConditionEquals(BackupConditionJobScheduled, metav1.ConditionTrue),
		),
	),
	// Failed: any of these
	rules.NewPhaseRule(
		BackupPhaseFailed,
		rules.ConditionsAny(
			rules.ConditionEquals(BackupConditionBucketStoreReady, metav1.ConditionFalse),
			rules.ConditionEquals(BackupConditionAccessRequestReady, metav1.ConditionFalse),
			rules.ConditionEquals(BackupConditionJobFailed, metav1.ConditionTrue),
		),
	),
	// Pending: any precursor still unknown
	rules.NewPhaseRule(
		BackupPhasePending,
		rules.ConditionsAny(
			rules.ConditionEquals(BackupConditionBucketStoreReady, metav1.ConditionUnknown),
			rules.ConditionEquals(BackupConditionAccessRequestReady, metav1.ConditionUnknown),
		),
	),
	// Pending: not yet scheduled (multiple allowed statuses per condition)
	rules.NewPhaseRule(
		BackupPhasePending,
		rules.ConditionsAll(
			rules.ConditionEquals(BackupConditionBucketStoreReady, metav1.ConditionTrue, metav1.ConditionUnknown),
			rules.ConditionEquals(BackupConditionAccessRequestReady, metav1.ConditionTrue, metav1.ConditionUnknown),
			rules.ConditionEquals(BackupConditionJobScheduled, metav1.ConditionUnknown, metav1.ConditionFalse),
		),
	),
}
```

### Using StatusManager (from airlock)

Your CR implements **Object2** (embed `client.Object` and add `SetPhase`, `GetPhase`, `SetObservedGeneration`). In the reconciler you create a manager with the reconciler as the status client, the CR’s conditions slice, the CR, and the resource’s phase rules. Then call **SetCondition** or **SetConditions** as you reconcile; the manager handles phase and the status patch.

```go
// In Reconcile(ctx, req):
mgr := conditions.NewManager(r, &backup.Status.Conditions, &backup, BackupPhaseRules)

// First time (fresh resource): set initial conditions
if backup.Status.ObservedGeneration == nil {
	if err := mgr.SetConditions(ctx, []conditions.Condition{
		{Type: BackupConditionBucketStoreReady, Status: metav1.ConditionUnknown, Reason: BackupReasonBackupNotStarted, Message: "Backup has not been started yet"},
		{Type: BackupConditionAccessRequestReady, Status: metav1.ConditionUnknown, Reason: BackupReasonAccessRequestNotReady, Message: "Access request has not been started yet"},
	}); err != nil { ... }
}

// During reconcile: set one condition at a time as you discover state
if err := r.Get(ctx, key, &store); err != nil {
	return ..., mgr.SetCondition(ctx, BackupConditionBucketStoreReady, metav1.ConditionFalse, BackupReasonBackupStoreNotFound, "backup store not found")
}
if err := mgr.SetCondition(ctx, BackupConditionBucketStoreReady, metav1.ConditionTrue, BackupReasonBackupStoreReady, "Backup store is ready"); err != nil { ... }
// ... job scheduled / completed / failed ...
if err := mgr.SetCondition(ctx, BackupConditionJobCompleted, metav1.ConditionTrue, "BackupJobCompleted", "Backup job has completed"); err != nil { ... }
```

## Dependency

- `k8s.io/apimachinery` (for `metav1.Condition`, `meta.SetStatusCondition`, etc.)
- `sigs.k8s.io/controller-runtime` (for `client.StatusClient`, `client.Object`, `client.MergeFrom`, `log.FromContext`)

## Layout

- `main.go` — no-op `main()`; program is test-only.
- `rules/phase_rule.go` — phase rule types and condition matchers.
- `rules/phase_rule_test.go` — tests for `ConditionsAll`, `ConditionsAny`, `ConditionEquals`, `Satisfies`, `Phase`, `ComputePhase`, and `PhaseUnknown`.
- `conditions/conditions.go` — `StatusManager`, `Object2`, `Condition`; updates conditions and phase, then patches status via `client.Status().Patch`.
