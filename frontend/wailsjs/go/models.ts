export namespace admanager {
	
	export class JoinDomainResult {
	    success: boolean;
	    message: string;
	    error?: string;
	    details?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new JoinDomainResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.error = source["error"];
	        this.details = source["details"];
	    }
	}

}

export namespace printers {
	
	export class Printer {
	    name: string;
	    location: string;
	    description: string;
	    model: string;
	    status: string;
	    uri: string;
	    driver: string;
	    queue: string;
	    isShared: boolean;
	    isDefault: boolean;
	    isInstalled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Printer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.location = source["location"];
	        this.description = source["description"];
	        this.model = source["model"];
	        this.status = source["status"];
	        this.uri = source["uri"];
	        this.driver = source["driver"];
	        this.queue = source["queue"];
	        this.isShared = source["isShared"];
	        this.isDefault = source["isDefault"];
	        this.isInstalled = source["isInstalled"];
	    }
	}
	export class PrinterInstallResult {
	    success: boolean;
	    message: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PrinterInstallResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.error = source["error"];
	    }
	}

}

