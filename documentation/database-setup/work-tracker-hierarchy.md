# Work Tracker – Page & Database Hierarchy

```text
Work Tracker
│
├── Daily Work
│   └── Work Log [Database]
│       ├── All [View]
│       └── Appraisal [View]
│
├── Feedback & Growth
│   └── Feedback [Database]
│       ├── All [View]
│       ├── Positive [View]
│       ├── Improvement [View]
│       └── Appraisal [View]
│
├── Sprint Planning
│   ├── Sprints [Database]
│   │   ├── All [View]
│   │   └── Capacity [View]
│   │
│   └── Sprint Allocation [Database]
│       ├── All [View]
│       └── Current Sprint [View]
│
├── JIRA Management
│   └── JIRAs [Database]
│       ├── All [View]
│       ├── Active Sprint [View]
│       ├── Blocked [View]
│       ├── Spillovers [View]
│       ├── Appraisal [View]
│       ├── Demo Pending [View]
│       └── Demoed [View]
│
├── Release Management
│   └── Release Items [Database]
│       ├── All [View]
│       ├── Pending Confirmation [View]
│       ├── Confirmed [View]
│       └── Not Announced [View]
│
├── Setup
│   ├── Companies [Database]
│   ├── Teams [Database]
│   └── Projects [Database]
│
└── Work Links [Database]
```

## Suggested purpose of each page

### Daily Work
For everyday work-log entry and appraisal-worthy work tracking.

### Feedback & Growth
For feedback received from managers, leads, colleagues, clients, and others. Keeps the feedback context, source, work organization, details, and follow-up actions available for reviews and appraisal preparation.

### Sprint Planning
For sprint dates, capacity, leave/holiday deductions, Jira allocation, and remaining bandwidth.

### JIRA Management
For all Jira tracking, including active sprint work, blocked tickets, spillovers, demos, appraisal items, dependencies, and release-item creation.

### Release Management
For component-level release tracking where one Jira may have multiple micro-app/component releases with different deployment types and versions.

### Setup
For relatively stable master data such as company, team, and project information.

### Work Links
For frequently used office links such as Jira, timesheet, sprint dashboard, prod-support rota, and similar references.
