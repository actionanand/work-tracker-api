export interface CompanyRef {
	id: string;
	name: string;
}

export interface TeamRef {
	id: string;
	name: string;
}

export interface ProjectRef {
	id: string;
	name: string;
}

export interface SprintRef {
	id: string;
	name: string;
}

export interface JiraRef {
	id: string;
	key: string;
	summary: string;
}

export interface IncludeRelationsOption {
	includeRelations?: boolean;
}
