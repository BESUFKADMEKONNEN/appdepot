//! Transactional plan execution and rollback engine.

use appdepot_types::Plan;

pub struct PlanExecutor;

impl PlanExecutor {
    pub fn dry_run(plan: &Plan) -> Vec<String> {
        plan.actions
            .iter()
            .map(|a| format!("{:?}", a))
            .collect()
    }
}
