




CKEDITOR.resourceManager = function( basePath, fileName ) {
	
	this.basePath = basePath;

	
	this.fileName = fileName;

	
	this.registered = {};

	
	this.loaded = {};

	
	this.externals = {};

	
	this._ = {
		// List of callbacks waiting for plugins to be loaded.
		waitingList: {}
	};
};

CKEDITOR.resourceManager.prototype = {
	
	add: function( name, definition ) {
		if ( this.registered[ name ] )
			throw new Error( '[CKEDITOR.resourceManager.add] The resource name "' + name + '" is already registered.' );

		var resource = this.registered[ name ] = definition || {};
		resource.name = name;
		resource.path = this.getPath( name );

		CKEDITOR.fire( name + CKEDITOR.tools.capitalize( this.fileName ) + 'Ready', resource );

		return this.get( name );
	},

	
	get: function( name ) {
		return this.registered[ name ] || null;
	},

	
	getPath: function( name ) {
		var external = this.externals[ name ];
		return CKEDITOR.getUrl( ( external && external.dir ) || this.basePath + name + '/' );
	},

	
	getFilePath: function( name ) {
		var external = this.externals[ name ];
		return CKEDITOR.getUrl( this.getPath( name ) + ( external ? external.file : this.fileName + '.js' ) );
	},

	
	addExternal: function( names, path, fileName ) {
		names = names.split( ',' );
		for ( var i = 0; i < names.length; i++ ) {
			var name = names[ i ];

			// If "fileName" is not provided, we assume that it may be available
			// in "path". Try to extract it in this case.
			if ( !fileName ) {
				path = path.replace( /[^\/]+$/, function( match ) {
					fileName = match;
					return '';
				} );
			}

			this.externals[ name ] = {
				dir: path,

				// Use the default file name if there is no "fileName" and it
				// was not found in "path".
				file: fileName || ( this.fileName + '.js' )
			};
		}
	},

	
	load: function( names, callback, scope ) {
		// Ensure that we have an array of names.
		if ( !CKEDITOR.tools.isArray( names ) )
			names = names ? [ names ] : [];

		var loaded = this.loaded,
			registered = this.registered,
			urls = [],
			urlsNames = {},
			resources = {};

		// Loop through all names.
		for ( var i = 0; i < names.length; i++ ) {
			var name = names[ i ];

			if ( !name )
				continue;

			// If not available yet.
			if ( !loaded[ name ] && !registered[ name ] ) {
				var url = this.getFilePath( name );
				urls.push( url );
				if ( !( url in urlsNames ) )
					urlsNames[ url ] = [];
				urlsNames[ url ].push( name );
			} else {
				resources[ name ] = this.get( name );
			}
		}

		CKEDITOR.scriptLoader.load( urls, function( completed, failed ) {
			if ( failed.length ) {
				throw new Error( '[CKEDITOR.resourceManager.load] Resource name "' + urlsNames[ failed[ 0 ] ].join( ',' ) +
					'" was not found at "' + failed[ 0 ] + '".' );
			}

			for ( var i = 0; i < completed.length; i++ ) {
				var nameList = urlsNames[ completed[ i ] ];
				for ( var j = 0; j < nameList.length; j++ ) {
					var name = nameList[ j ];
					resources[ name ] = this.get( name );

					loaded[ name ] = 1;
				}
			}

			callback.call( scope, resources );
		}, this );
	}
};
