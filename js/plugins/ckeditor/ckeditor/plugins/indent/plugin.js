



( function() {
	'use strict';

	var TRISTATE_DISABLED = CKEDITOR.TRISTATE_DISABLED,
		TRISTATE_OFF = CKEDITOR.TRISTATE_OFF;

	CKEDITOR.plugins.add( 'indent', {
		// jscs:disable maximumLineLength
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
		// jscs:enable maximumLineLength
		icons: 'indent,indent-rtl,outdent,outdent-rtl', // %REMOVE_LINE_CORE%
		hidpi: true, // %REMOVE_LINE_CORE%

		init: function( editor ) {
			var genericDefinition = CKEDITOR.plugins.indent.genericDefinition;

			// Register generic commands.
			setupGenericListeners( editor, editor.addCommand( 'indent', new genericDefinition( true ) ) );
			setupGenericListeners( editor, editor.addCommand( 'outdent', new genericDefinition() ) );

			// Create and register toolbar button if possible.
			if ( editor.ui.addButton ) {
				editor.ui.addButton( 'Indent', {
					label: editor.lang.indent.indent,
					command: 'indent',
					directional: true,
					toolbar: 'indent,20'
				} );

				editor.ui.addButton( 'Outdent', {
					label: editor.lang.indent.outdent,
					command: 'outdent',
					directional: true,
					toolbar: 'indent,10'
				} );
			}

			// Register dirChanged listener.
			editor.on( 'dirChanged', function( evt ) {
				var range = editor.createRange(),
					dataNode = evt.data.node;

				range.setStartBefore( dataNode );
				range.setEndAfter( dataNode );

				var walker = new CKEDITOR.dom.walker( range ),
					node;

				while ( ( node = walker.next() ) ) {
					if ( node.type == CKEDITOR.NODE_ELEMENT ) {
						// A child with the defined dir is to be ignored.
						if ( !node.equals( dataNode ) && node.getDirection() ) {
							range.setStartAfter( node );
							walker = new CKEDITOR.dom.walker( range );
							continue;
						}

						// Switch alignment classes.
						var classes = editor.config.indentClasses;
						if ( classes ) {
							var suffix = ( evt.data.dir == 'ltr' ) ? [ '_rtl', '' ] : [ '', '_rtl' ];
							for ( var i = 0; i < classes.length; i++ ) {
								if ( node.hasClass( classes[ i ] + suffix[ 0 ] ) ) {
									node.removeClass( classes[ i ] + suffix[ 0 ] );
									node.addClass( classes[ i ] + suffix[ 1 ] );
								}
							}
						}

						// Switch the margins.
						var marginLeft = node.getStyle( 'margin-right' ),
							marginRight = node.getStyle( 'margin-left' );

						marginLeft ? node.setStyle( 'margin-left', marginLeft ) : node.removeStyle( 'margin-left' );
						marginRight ? node.setStyle( 'margin-right', marginRight ) : node.removeStyle( 'margin-right' );
					}
				}
			} );
		}
	} );

	
	CKEDITOR.plugins.indent = {
		
		genericDefinition: function( isIndent ) {
			
			this.isIndent = !!isIndent;

			// Mimic naive startDisabled behavior for outdent.
			this.startDisabled = !this.isIndent;
		},

		
		specificDefinition: function( editor, name, isIndent ) {
			this.name = name;
			this.editor = editor;

			
			this.jobs = {};

			
			this.enterBr = editor.config.enterMode == CKEDITOR.ENTER_BR;

			
			this.isIndent = !!isIndent;

			
			this.relatedGlobal = isIndent ? 'indent' : 'outdent';

			
			this.indentKey = isIndent ? 9 : CKEDITOR.SHIFT + 9;

			
			this.database = {};
		},

		
		registerCommands: function( editor, commands ) {
			editor.on( 'pluginsLoaded', function() {
				for ( var name in commands ) {
					( function( editor, command ) {
						var relatedGlobal = editor.getCommand( command.relatedGlobal );

						for ( var priority in command.jobs ) {
							// Observe generic exec event and execute command when necessary.
							// If the command was successfully handled by the command and
							// DOM has been modified, stop event propagation so no other plugin
							// will bother. Job is done.
							relatedGlobal.on( 'exec', function( evt ) {
								if ( evt.data.done )
									return;

								// Make sure that anything this command will do is invisible
								// for undoManager. What undoManager only can see and
								// remember is the execution of the global command (relatedGlobal).
								editor.fire( 'lockSnapshot' );

								if ( command.execJob( editor, priority ) )
									evt.data.done = true;

								editor.fire( 'unlockSnapshot' );

								// Clean up the markers.
								CKEDITOR.dom.element.clearAllMarkers( command.database );
							}, this, null, priority );

							// Observe generic refresh event and force command refresh.
							// Once refreshed, save command state in event data
							// so generic command plugin can update its own state and UI.
							relatedGlobal.on( 'refresh', function( evt ) {
								if ( !evt.data.states )
									evt.data.states = {};

								evt.data.states[ command.name + '@' + priority ] =
									command.refreshJob( editor, priority, evt.data.path );
							}, this, null, priority );
						}

						// Since specific indent commands have no UI elements,
						// they need to be manually registered as a editor feature.
						editor.addFeature( command );
					} )( this, commands[ name ] );
				}
			} );
		}
	};

	CKEDITOR.plugins.indent.genericDefinition.prototype = {
		context: 'p',

		exec: function() {}
	};

	CKEDITOR.plugins.indent.specificDefinition.prototype = {
		
		execJob: function( editor, priority ) {
			var job = this.jobs[ priority ];

			if ( job.state != TRISTATE_DISABLED )
				return job.exec.call( this, editor );
		},

		
		refreshJob: function( editor, priority, path ) {
			var job = this.jobs[ priority ];

			if ( !editor.activeFilter.checkFeature( this ) )
				job.state = TRISTATE_DISABLED;
			else
				job.state = job.refresh.call( this, editor, path );

			return job.state;
		},

		
		getContext: function( path ) {
			return path.contains( this.context );
		}
	};

	
	function setupGenericListeners( editor, command ) {
		var selection, bookmarks;

		// Set the command state according to content-specific
		// command states.
		command.on( 'refresh', function( evt ) {
			// If no state comes with event data, disable command.
			var states = [ TRISTATE_DISABLED ];

			for ( var s in evt.data.states )
				states.push( evt.data.states[ s ] );

			this.setState( CKEDITOR.tools.search( states, TRISTATE_OFF ) ? TRISTATE_OFF : TRISTATE_DISABLED );
		}, command, null, 100 );

		// Initialization. Save bookmarks and mark event as not handled
		// by any plugin (command) yet.
		command.on( 'exec', function( evt ) {
			selection = editor.getSelection();
			bookmarks = selection.createBookmarks( 1 );

			// Mark execution as not handled yet.
			if ( !evt.data )
				evt.data = {};

			evt.data.done = false;
		}, command, null, 0 );

		// Housekeeping. Make sure selectionChange will be called.
		// Also re-select previously saved bookmarks.
		command.on( 'exec', function() {
			editor.forceNextSelectionCheck();
			selection.selectBookmarks( bookmarks );
		}, command, null, 100 );
	}
} )();
