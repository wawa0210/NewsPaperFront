



if ( CKEDITOR.status == 'unloaded' ) {
	( function() {
		CKEDITOR.event.implementOn( CKEDITOR );

		
		CKEDITOR.loadFullCore = function() {
			// If the basic code is not ready, just mark it to be loaded.
			if ( CKEDITOR.status != 'basic_ready' ) {
				CKEDITOR.loadFullCore._load = 1;
				return;
			}

			// Destroy this function.
			delete CKEDITOR.loadFullCore;

			// Append the script to the head.
			var script = document.createElement( 'script' );
			script.type = 'text/javascript';
			script.src = CKEDITOR.basePath + 'ckeditor.js';
			script.src = CKEDITOR.basePath + 'ckeditor_source.js'; // %REMOVE_LINE%

			document.getElementsByTagName( 'head' )[ 0 ].appendChild( script );
		};

		
		CKEDITOR.loadFullCoreTimeout = 0;

		// Documented at ckeditor.js.
		CKEDITOR.add = function( editor ) {
			// For now, just put the editor in the pending list. It will be
			// processed as soon as the full code gets loaded.
			var pending = this._.pending || ( this._.pending = [] );
			pending.push( editor );
		};

		( function() {
			var onload = function() {
					var loadFullCore = CKEDITOR.loadFullCore,
						loadFullCoreTimeout = CKEDITOR.loadFullCoreTimeout;

					if ( !loadFullCore )
						return;

					CKEDITOR.status = 'basic_ready';

					if ( loadFullCore && loadFullCore._load )
						loadFullCore();
					else if ( loadFullCoreTimeout ) {
						setTimeout( function() {
							if ( CKEDITOR.loadFullCore )
								CKEDITOR.loadFullCore();
						}, loadFullCoreTimeout * 1000 );
					}
				};

			CKEDITOR.domReady( onload );
		} )();

		CKEDITOR.status = 'basic_loaded';
	} )();
}
