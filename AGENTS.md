# PerformanceHub project continuity

The product being developed is PerformanceHub at
`F:\_3dprinter\_JB_PerformanceHub`. ForcePlate is only one PerformanceHub module,
located at `F:\_3dprinter\_JB_PerformanceHub\modules\forceplates`.

The repository `F:\_3dprinter\_JB_ForcePlate` contains the embedded ForcePlate
firmware used by that module. It is a supporting component, not the main product
or an alternative application.

## Mandatory targeting rule

Interpret product, UI, workflow, discipline, Session, Realtime, Results, Settings,
and visualization requests in the context of PerformanceHub. For ForcePlate UI
work, the target is the PerformanceHub module above.

Only edit the embedded repository when the requested PerformanceHub feature also
requires firmware, ESP32, ADS1256, board communication, OLED, calibration,
load-cell acquisition, or binary protocol changes. When work crosses the module
and firmware, update both intentionally while keeping PerformanceHub as the
product-level source of truth.

Treat `F:\_3dprinter\_JB_ForcePlate\tools\forceplate_analyzer` as nonexistent.
Do not inspect, search, run, test, mention, or modify it unless the user explicitly
requests that exact legacy analyzer. Its presence inside the firmware repository
must never influence target selection.

Before making changes, state the actual PerformanceHub module and any supporting
firmware component being edited. Preserve existing user changes and verify files
at their real target paths, not only in staging copies.
