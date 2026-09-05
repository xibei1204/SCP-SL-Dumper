# Case Scope

## meta
- case_id: scp-sl-il2cpp-dumper
- operator: local
- primary_skill: reverse-engineering
- lead_role: lead
- specialist_roles: [cre]

## auth
- status: granted
- basis: owner-operated local installation
- evidence_of_auth: user supplied the local client and project paths

## in_scope
- assets:
  - C:\SteamLibrary\steamapps\common\SCP Secret Laboratory\GameAssembly.dll
  - C:\SteamLibrary\steamapps\common\SCP Secret Laboratory\SCPSL_Data\il2cpp_data\Metadata\global-metadata.dat
- surfaces: [binary, il2cpp_metadata]
- activities: [offline_reverse, local_runtime_introspection, dump_generation, local_build]

## out_of_scope
- assets: [remote services, game servers, other installations]
- activities: [network probing, remote-service interaction, binary patching]

## network_profile
- mode: offline

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] offline sample paths set
  - [x] network_profile.mode chosen
  - [x] out_of_scope reviewed
  - [x] roles assigned
