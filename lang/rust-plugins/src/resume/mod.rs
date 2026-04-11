use std::any::TypeId;
use tramli::{CloneAny, FlowEngine, FlowError, FlowState};

/// Rich resume status classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RichResumeStatus {
    Transitioned,
    AlreadyComplete,
    NoApplicableTransition,
    Rejected,
    ExceptionRouted,
}

/// Rich resume result.
#[derive(Debug)]
pub struct RichResumeResult {
    pub status: RichResumeStatus,
    pub error: Option<FlowError>,
}

/// Enhanced resume with explicit status classification.
pub struct RichResumeExecutor;

impl RichResumeExecutor {
    pub fn resume<S: FlowState>(
        engine: &mut FlowEngine<S>,
        flow_id: &str,
        external_data: Vec<(TypeId, Box<dyn CloneAny>)>,
        previous_state: S,
    ) -> RichResumeResult {
        match engine.resume_and_execute(flow_id, external_data) {
            Ok(()) => {
                let flow = engine.store.get(flow_id);
                match flow {
                    Some(f) => {
                        if f.is_completed() && f.current_state() == previous_state {
                            RichResumeResult { status: RichResumeStatus::AlreadyComplete, error: None }
                        } else if f.current_state() == previous_state && !f.is_completed() {
                            RichResumeResult { status: RichResumeStatus::Rejected, error: None }
                        } else {
                            RichResumeResult { status: RichResumeStatus::Transitioned, error: None }
                        }
                    }
                    None => RichResumeResult { status: RichResumeStatus::NoApplicableTransition, error: None },
                }
            }
            Err(e) => {
                let status = match e.code {
                    "FLOW_ALREADY_COMPLETED" => RichResumeStatus::AlreadyComplete,
                    "FLOW_NOT_FOUND" => RichResumeStatus::NoApplicableTransition,
                    "INVALID_TRANSITION" => RichResumeStatus::NoApplicableTransition,
                    _ => RichResumeStatus::ExceptionRouted,
                };
                RichResumeResult { status, error: Some(e) }
            }
        }
    }
}
