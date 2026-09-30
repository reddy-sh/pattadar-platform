/**
 * The feature-type catalogue `web.features` answers with, exactly as
 * services/api/src/feature_schema.py FEATURE_TYPES defines it and web360.py
 * serialises it (camelCase, every field the query selects).
 *
 * GENERATED on 27/09/2026 from feature_schema.py, not written by hand. If the
 * catalogue changes, regenerate it the same way rather than editing entries:
 * a hand-kept copy is how the seed fell behind in 37ae2ca, when `types` joined
 * the query and the Add-a-feature panel here drew no type chips at all.
 */
export const FEATURE_TYPES = [
  {
    "key": "bore",
    "label": "Bore",
    "category": "water",
    "icon": "bore",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "depthFt",
        "label": "Depth",
        "kind": "number",
        "unit": "ft",
        "placeholder": "420",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "diameterIn",
        "label": "Diameter",
        "kind": "number",
        "unit": "in",
        "placeholder": "5",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "casingDepthFt",
        "label": "Casing depth",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "yieldInches",
        "label": "Water yield",
        "kind": "number",
        "unit": "in",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "drilledOn",
        "label": "Drilled on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "drillerCompany",
        "label": "Drilling company",
        "kind": "text",
        "unit": "",
        "placeholder": "Company or contractor",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "motorInstalled",
        "label": "Motor installed",
        "kind": "boolean",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "motorHp",
        "label": "Motor power",
        "kind": "number",
        "unit": "HP",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "motorInstalled",
        "dependsValue": "true"
      },
      {
        "key": "motorPhase",
        "label": "Motor phase",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Single phase",
          "Three phase"
        ],
        "required": false,
        "dependsOn": "motorInstalled",
        "dependsValue": "true"
      },
      {
        "key": "motorMake",
        "label": "Motor make",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "motorInstalled",
        "dependsValue": "true"
      },
      {
        "key": "motorModel",
        "label": "Motor model",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "motorInstalled",
        "dependsValue": "true"
      },
      {
        "key": "pumpType",
        "label": "Pump type",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Submersible",
          "Jet",
          "Other"
        ],
        "required": false,
        "dependsOn": "motorInstalled",
        "dependsValue": "true"
      },
      {
        "key": "lastServicedOn",
        "label": "Last serviced",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "motorInstalled",
        "dependsValue": "true"
      }
    ]
  },
  {
    "key": "well",
    "label": "Well",
    "category": "water",
    "icon": "well",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "depthFt",
        "label": "Depth",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "diameterFt",
        "label": "Diameter",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "waterLevelFt",
        "label": "Water level",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lined",
        "label": "Lined well",
        "kind": "boolean",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "pumpInstalled",
        "label": "Pump installed",
        "kind": "boolean",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "pumpHp",
        "label": "Pump power",
        "kind": "number",
        "unit": "HP",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "pumpInstalled",
        "dependsValue": "true"
      }
    ]
  },
  {
    "key": "pond",
    "label": "Pond",
    "category": "water",
    "icon": "pond",
    "geometryKind": "polygon",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "areaSqFt",
        "label": "Area",
        "kind": "number",
        "unit": "sq ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "depthFt",
        "label": "Depth",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lining",
        "label": "Lining",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Earth",
          "Stone",
          "Concrete",
          "Plastic"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "waterSource",
        "label": "Water source",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "capacityLitres",
        "label": "Capacity",
        "kind": "number",
        "unit": "L",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "transformer",
    "label": "Transformer",
    "category": "power",
    "icon": "transformer",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "capacityKva",
        "label": "Capacity",
        "kind": "number",
        "unit": "kVA",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "phase",
        "label": "Phase",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Single phase",
          "Three phase"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "owner",
        "label": "Owned by",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Utility",
          "Private",
          "Shared"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "serviceNumber",
        "label": "Service number",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "manufacturer",
        "label": "Manufacturer",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "serialNumber",
        "label": "Serial number",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "installedOn",
        "label": "Installed on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "meter",
    "label": "Meter",
    "category": "power",
    "icon": "meter",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "meterNumber",
        "label": "Meter number",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "serviceNumber",
        "label": "Service number",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "provider",
        "label": "Electricity provider",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "phase",
        "label": "Phase",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Single phase",
          "Three phase"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "sanctionedLoadKw",
        "label": "Sanctioned load",
        "kind": "number",
        "unit": "kW",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "installedOn",
        "label": "Installed on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "solar",
    "label": "Solar",
    "category": "power",
    "icon": "solar",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "capacityKw",
        "label": "Capacity",
        "kind": "number",
        "unit": "kW",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "panelCount",
        "label": "Panels",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "inverterMake",
        "label": "Inverter make",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "inverterModel",
        "label": "Inverter model",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "installedOn",
        "label": "Installed on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "warrantyUntil",
        "label": "Warranty until",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "fence",
    "label": "Fence",
    "category": "access",
    "icon": "fence",
    "geometryKind": "line",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "material",
        "label": "Material",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Barbed wire",
          "Chain link",
          "Stone",
          "Concrete",
          "Live fence",
          "Other"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lengthM",
        "label": "Length",
        "kind": "number",
        "unit": "m",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "heightFt",
        "label": "Height",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "installedOn",
        "label": "Installed on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "gate",
    "label": "Gate",
    "category": "access",
    "icon": "gate",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "material",
        "label": "Material",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "widthFt",
        "label": "Width",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lockType",
        "label": "Lock type",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "installedOn",
        "label": "Installed on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "shed",
    "label": "Shed",
    "category": "structures",
    "icon": "shed",
    "geometryKind": "polygon",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "use",
        "label": "Used for",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "areaSqFt",
        "label": "Built-up area",
        "kind": "number",
        "unit": "sq ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "roofMaterial",
        "label": "Roof material",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "builtYear",
        "label": "Built year",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "house",
    "label": "House",
    "category": "structures",
    "icon": "house",
    "geometryKind": "polygon",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "areaSqFt",
        "label": "Built-up area",
        "kind": "number",
        "unit": "sq ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "floors",
        "label": "Floors",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "rooms",
        "label": "Rooms",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "builtYear",
        "label": "Built year",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "occupancy",
        "label": "Occupancy",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Owner",
          "Tenant",
          "Vacant"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "compound_wall",
    "label": "Compound wall",
    "category": "structures",
    "icon": "wall",
    "geometryKind": "line",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "material",
        "label": "Material",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lengthM",
        "label": "Length",
        "kind": "number",
        "unit": "m",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "heightFt",
        "label": "Height",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "builtYear",
        "label": "Built year",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "tree",
    "label": "Tree",
    "category": "planting",
    "icon": "tree",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "species",
        "label": "Species",
        "kind": "text",
        "unit": "",
        "placeholder": "Neem, mango, coconut",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "variety",
        "label": "Variety",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "count",
        "label": "Number of trees",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "plantedYear",
        "label": "Planted year",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "irrigation",
        "label": "Irrigation",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Rainfed",
          "Drip",
          "Canal",
          "Bore",
          "Other"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "fruiting",
        "label": "Currently fruiting",
        "kind": "boolean",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "annualYieldKg",
        "label": "Annual yield",
        "kind": "number",
        "unit": "kg",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "healthNote",
        "label": "Tree health note",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "crop",
    "label": "Crop",
    "category": "planting",
    "icon": "crop",
    "geometryKind": "polygon",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "crop",
        "label": "Crop name",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "variety",
        "label": "Variety",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "areaAcres",
        "label": "Area",
        "kind": "number",
        "unit": "ac",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "season",
        "label": "Season",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "sownOn",
        "label": "Sown on",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "expectedHarvestOn",
        "label": "Expected harvest",
        "kind": "date",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "irrigation",
        "label": "Irrigation",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "road",
    "label": "Road",
    "category": "access",
    "icon": "road",
    "geometryKind": "line",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "surface",
        "label": "Surface",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Soil",
          "Gravel",
          "Concrete",
          "Bitumen"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "widthFt",
        "label": "Width",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lengthM",
        "label": "Length",
        "kind": "number",
        "unit": "m",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "accessType",
        "label": "Access",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Public",
          "Private",
          "Shared",
          "Right of way"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "bund",
    "label": "Bund",
    "category": "water",
    "icon": "bund",
    "geometryKind": "line",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "lengthM",
        "label": "Length",
        "kind": "number",
        "unit": "m",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "heightFt",
        "label": "Height",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "material",
        "label": "Material",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "conditionNote",
        "label": "Condition note",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "canal",
    "label": "Canal",
    "category": "water",
    "icon": "canal",
    "geometryKind": "line",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "canalType",
        "label": "Canal type",
        "kind": "select",
        "unit": "",
        "placeholder": "",
        "options": [
          "Government",
          "Private",
          "Field channel"
        ],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "widthFt",
        "label": "Width",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "depthFt",
        "label": "Depth",
        "kind": "number",
        "unit": "ft",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "lengthM",
        "label": "Length",
        "kind": "number",
        "unit": "m",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "waterSource",
        "label": "Water source",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  },
  {
    "key": "custom",
    "label": "Something else",
    "category": "other",
    "icon": "feature",
    "geometryKind": "point",
    "schemaVersion": 1,
    "fields": [
      {
        "key": "description",
        "label": "Description",
        "kind": "text",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "quantity",
        "label": "Quantity",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      },
      {
        "key": "installedYear",
        "label": "Installed or planted year",
        "kind": "number",
        "unit": "",
        "placeholder": "",
        "options": [],
        "required": false,
        "dependsOn": "",
        "dependsValue": ""
      }
    ]
  }
] as const;
