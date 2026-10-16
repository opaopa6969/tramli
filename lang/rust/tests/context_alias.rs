use std::any::{type_name, TypeId};
use std::collections::HashMap;
use tramli::{CloneAny, FlowContext};

#[derive(Clone, Debug, PartialEq)]
struct Alpha {
    value: String,
}
#[derive(Clone, Debug, PartialEq)]
struct Beta {
    count: i32,
}

#[test]
fn aliases_round_trip_with_independent_copies_and_both_directions() {
    let mut source = FlowContext::new("source".into());
    source.register_alias::<Alpha>("alpha");
    source.register_alias::<Beta>("beta");
    let mut aliases = source.export_aliases();
    assert_eq!(
        aliases,
        HashMap::from([
            ("alpha".into(), TypeId::of::<Alpha>()),
            ("beta".into(), TypeId::of::<Beta>()),
        ])
    );
    let mut target = FlowContext::new("target".into());
    target.import_aliases(aliases.clone());
    aliases.clear();
    assert_eq!(source.export_aliases(), target.export_aliases());
    assert_eq!(target.alias_of(&TypeId::of::<Alpha>()), Some("alpha"));
    assert_eq!(target.type_id_of_alias("beta"), Some(&TypeId::of::<Beta>()));
    assert!(target.snapshot().is_empty());
    target.import_aliases(HashMap::from([("renamed".into(), TypeId::of::<Alpha>())]));
    source.register_alias::<Alpha>("renamed");
    assert_eq!(source.export_aliases(), target.export_aliases());
    assert_eq!(
        source.alias_of(&TypeId::of::<Alpha>()),
        target.alias_of(&TypeId::of::<Alpha>())
    );
}

// shared-tests/scenarios/alias-data-round-trip.yaml
#[test]
fn alias_data_round_trip() {
    let mut source = FlowContext::new("source".into());
    source.register_alias::<Alpha>("alpha");
    source.register_alias::<Beta>("beta");
    source.put(Alpha {
        value: "hello".into(),
    });
    source.put(Beta { count: 7 });
    let exported = source.to_aliased_data();
    assert_eq!(exported.len(), 2);
    assert_eq!(
        exported["alpha"]
            .as_any()
            .downcast_ref::<Alpha>()
            .unwrap()
            .value,
        "hello"
    );
    assert_eq!(
        exported["beta"]
            .as_any()
            .downcast_ref::<Beta>()
            .unwrap()
            .count,
        7
    );
    let mut data: HashMap<String, Box<dyn CloneAny>> = exported
        .into_iter()
        .map(|(alias, value)| (alias, value.clone_box()))
        .collect();
    data.insert(
        "unknown".into(),
        Box::new(Alpha {
            value: "ignored".into(),
        }),
    );
    let mut target = FlowContext::new("target".into());
    target.import_aliases(source.export_aliases());
    target.put(Alpha {
        value: "old".into(),
    });
    target.from_aliased_data(data);
    assert_eq!(
        source.get::<Alpha>().unwrap(),
        target.get::<Alpha>().unwrap()
    );
    assert_eq!(source.get::<Beta>().unwrap(), target.get::<Beta>().unwrap());
    assert_eq!(source.to_aliased_data().len(), 2);
    assert_eq!(target.to_aliased_data().len(), 2);
}

#[test]
fn unregistered_keys_use_concrete_type_names_including_after_restore() {
    let mut source = FlowContext::new("source".into());
    source.put(Alpha {
        value: "hello".into(),
    });
    let mut restored = FlowContext::new("restored".into());
    restored.restore_from(source.snapshot());
    let data = restored.to_aliased_data();
    assert_eq!(data.len(), 1);
    assert_eq!(
        data[type_name::<Alpha>()].as_any().downcast_ref::<Alpha>(),
        source.find::<Alpha>()
    );
    let mut target = FlowContext::new("target".into());
    target.from_aliased_data(data.into_iter().map(|(k, v)| (k, v.clone_box())).collect());
    assert!(target.snapshot().is_empty());
}

#[test]
fn mismatched_types_and_unknown_aliases_are_ignored() {
    let mut ctx = FlowContext::new("target".into());
    ctx.register_alias::<Alpha>("alpha");
    ctx.register_alias::<Beta>("beta");
    ctx.put(Alpha {
        value: "original".into(),
    });
    let data: HashMap<String, Box<dyn CloneAny>> = HashMap::from([
        (
            "alpha".into(),
            Box::new(Beta { count: 99 }) as Box<dyn CloneAny>,
        ),
        (
            "beta".into(),
            Box::new(Alpha {
                value: "wrong".into(),
            }) as Box<dyn CloneAny>,
        ),
        (
            "unknown".into(),
            Box::new(Beta { count: 7 }) as Box<dyn CloneAny>,
        ),
    ]);
    ctx.from_aliased_data(data);
    assert_eq!(ctx.get::<Alpha>().unwrap().value, "original");
    assert!(!ctx.has::<Beta>());
    assert_eq!(ctx.snapshot().len(), 1);
}
