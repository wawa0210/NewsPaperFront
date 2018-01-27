



( function() {
	// Override the basic constructor defined at editor_basic.js.
	Editor.prototype = CKEDITOR.editor.prototype;
	CKEDITOR.editor = Editor;

	
	function Editor( instanceConfig, element, mode ) {
		// Call the CKEDITOR.event constructor to initialize this instance.
		CKEDITOR.event.call( this );

		// Make a clone of the config object, to avoid having it touched by our code. (#9636)
		instanceConfig = instanceConfig && CKEDITOR.tools.clone( instanceConfig );

		// if editor is created off one page element.
		if ( element !== undefined ) {
			// Asserting element and mode not null.
			if ( !( element instanceof CKEDITOR.dom.element ) )
				throw new Error( 'Expect element of type CKEDITOR.dom.element.' );
			else if ( !mode )
				throw new Error( 'One of the element modes must be specified.' );

			if ( CKEDITOR.env.ie && CKEDITOR.env.quirks && mode == CKEDITOR.ELEMENT_MODE_INLINE )
				throw new Error( 'Inline element mode is not supported on IE quirks.' );

			if ( !isSupportedElement( element, mode ) )
				throw new Error( 'The specified element mode is not supported on element: "' + element.getName() + '".' );

			
			this.element = element;

			
			this.elementMode = mode;

			this.name = ( this.elementMode != CKEDITOR.ELEMENT_MODE_APPENDTO ) && ( element.getId() || element.getNameAtt() );
		} else {
			this.elementMode = CKEDITOR.ELEMENT_MODE_NONE;
		}

		// Declare the private namespace.
		this._ = {};

		this.commands = {};

		
		this.templates = {};

		
		this.name = this.name || genEditorName();

		
		this.id = CKEDITOR.tools.getNextId();

		
		this.status = 'unloaded';

		
		this.config = CKEDITOR.tools.prototypedCopy( CKEDITOR.config );

		
		this.ui = new CKEDITOR.ui( this );

		
		this.focusManager = new CKEDITOR.focusManager( this );

		
		this.keystrokeHandler = new CKEDITOR.keystrokeHandler( this );

		// Make the editor update its command states on mode change.
		this.on( 'readOnly', updateCommands );
		this.on( 'selectionChange', function( evt ) {
			updateCommandsContext( this, evt.data.path );
		} );
		this.on( 'activeFilterChange', function() {
			updateCommandsContext( this, this.elementPath(), true );
		} );
		this.on( 'mode', updateCommands );

		// Handle startup focus.
		this.on( 'instanceReady', function() {
			this.config.startupFocus && this.focus();
		} );

		CKEDITOR.fire( 'instanceCreated', null, this );

		// Add this new editor to the CKEDITOR.instances collections.
		CKEDITOR.add( this );

		// Return the editor instance immediately to enable early stage event registrations.
		CKEDITOR.tools.setTimeout( function() {
			if ( this.status !== 'destroyed' ) {
				initConfig( this, instanceConfig );
			} else {
				CKEDITOR.warn( 'editor-incorrect-destroy' );
			}
		}, 0, this );
	}

	var nameCounter = 0;

	function genEditorName() {
		do {
			var name = 'editor' + ( ++nameCounter );
		}
		while ( CKEDITOR.instances[ name ] );

		return name;
	}

	// Asserting element DTD depending on mode.
	function isSupportedElement( element, mode ) {
		if ( mode == CKEDITOR.ELEMENT_MODE_INLINE )
			return element.is( CKEDITOR.dtd.$editable ) || element.is( 'textarea' );
		else if ( mode == CKEDITOR.ELEMENT_MODE_REPLACE )
			return !element.is( CKEDITOR.dtd.$nonBodyContent );
		return 1;
	}

	function updateCommands() {
		var commands = this.commands,
			name;

		for ( name in commands )
			updateCommand( this, commands[ name ] );
	}

	function updateCommand( editor, cmd ) {
		cmd[ cmd.startDisabled ? 'disable' : editor.readOnly && !cmd.readOnly ? 'disable' : cmd.modes[ editor.mode ] ? 'enable' : 'disable' ]();
	}

	function updateCommandsContext( editor, path, forceRefresh ) {
		// Commands cannot be refreshed without a path. In edge cases
		// it may happen that there's no selection when this function is executed.
		// For example when active filter is changed in #10877.
		if ( !path )
			return;

		var command,
			name,
			commands = editor.commands;

		for ( name in commands ) {
			command = commands[ name ];

			if ( forceRefresh || command.contextSensitive )
				command.refresh( editor, path );
		}
	}

	// ##### START: Config Privates

	// These function loads custom configuration files and cache the
	// CKEDITOR.editorConfig functions defined on them, so there is no need to
	// download them more than once for several instances.
	var loadConfigLoaded = {};

	function loadConfig( editor ) {
		var customConfig = editor.config.customConfig;

		// Check if there is a custom config to load.
		if ( !customConfig )
			return false;

		customConfig = CKEDITOR.getUrl( customConfig );

		var loadedConfig = loadConfigLoaded[ customConfig ] || ( loadConfigLoaded[ customConfig ] = {} );

		// If the custom config has already been downloaded, reuse it.
		if ( loadedConfig.fn ) {
			// Call the cached CKEDITOR.editorConfig defined in the custom
			// config file for the editor instance depending on it.
			loadedConfig.fn.call( editor, editor.config );

			// If there is no other customConfig in the chain, fire the
			// "configLoaded" event.
			if ( CKEDITOR.getUrl( editor.config.customConfig ) == customConfig || !loadConfig( editor ) )
				editor.fireOnce( 'customConfigLoaded' );
		} else {
			// Load the custom configuration file.
			// To resolve customConfig race conflicts, use scriptLoader#queue
			// instead of scriptLoader#load (#6504).
			CKEDITOR.scriptLoader.queue( customConfig, function() {
				// If the CKEDITOR.editorConfig function has been properly
				// defined in the custom configuration file, cache it.
				if ( CKEDITOR.editorConfig )
					loadedConfig.fn = CKEDITOR.editorConfig;
				else
					loadedConfig.fn = function() {};

				// Call the load config again. This time the custom
				// config is already cached and so it will get loaded.
				loadConfig( editor );
			} );
		}

		return true;
	}

	function initConfig( editor, instanceConfig ) {
		// Setup the lister for the "customConfigLoaded" event.
		editor.on( 'customConfigLoaded', function() {
			if ( instanceConfig ) {
				// Register the events that may have been set at the instance
				// configuration object.
				if ( instanceConfig.on ) {
					for ( var eventName in instanceConfig.on ) {
						editor.on( eventName, instanceConfig.on[ eventName ] );
					}
				}

				// Overwrite the settings from the in-page config.
				CKEDITOR.tools.extend( editor.config, instanceConfig, true );

				delete editor.config.on;
			}

			onConfigLoaded( editor );
		} );

		// The instance config may override the customConfig setting to avoid
		// loading the default ~/config.js file.
		if ( instanceConfig && instanceConfig.customConfig != null )
			editor.config.customConfig = instanceConfig.customConfig;

		// Load configs from the custom configuration files.
		if ( !loadConfig( editor ) )
			editor.fireOnce( 'customConfigLoaded' );
	}

	// ##### END: Config Privates

	// Set config related properties.
	function onConfigLoaded( editor ) {
		var config = editor.config;

		
		editor.readOnly = isEditorReadOnly();

		function isEditorReadOnly() {
			if ( config.readOnly ) {
				return true;
			}

			if ( editor.elementMode == CKEDITOR.ELEMENT_MODE_INLINE ) {
				if ( editor.element.is( 'textarea' ) ) {
					return editor.element.hasAttribute( 'disabled' ) || editor.element.hasAttribute( 'readonly' );
				} else {
					return editor.element.isReadOnly();
				}
			} else if ( editor.elementMode == CKEDITOR.ELEMENT_MODE_REPLACE ) {
				return editor.element.hasAttribute( 'disabled' ) || editor.element.hasAttribute( 'readonly' );
			}

			return false;
		}

		
		editor.blockless = editor.elementMode == CKEDITOR.ELEMENT_MODE_INLINE ?
			!( editor.element.is( 'textarea' ) || CKEDITOR.dtd[ editor.element.getName() ].p ) :
			false;

		
		editor.tabIndex = config.tabIndex || editor.element && editor.element.getAttribute( 'tabindex' ) || 0;

		editor.activeEnterMode = editor.enterMode = validateEnterMode( editor, config.enterMode );
		editor.activeShiftEnterMode = editor.shiftEnterMode = validateEnterMode( editor, config.shiftEnterMode );

		// Set CKEDITOR.skinName. Note that it is not possible to have
		// different skins on the same page, so the last one to set it "wins".
		if ( config.skin )
			CKEDITOR.skinName = config.skin;

		// Fire the "configLoaded" event.
		editor.fireOnce( 'configLoaded' );

		initComponents( editor );
	}

	// Various other core components that read editor configuration.
	function initComponents( editor ) {
		// Documented in dataprocessor.js.
		editor.dataProcessor = new CKEDITOR.htmlDataProcessor( editor );

		// Set activeFilter directly to avoid firing event.
		editor.filter = editor.activeFilter = new CKEDITOR.filter( editor );

		loadSkin( editor );
	}

	function loadSkin( editor ) {
		CKEDITOR.skin.loadPart( 'editor', function() {
			loadLang( editor );
		} );
	}

	function loadLang( editor ) {
		CKEDITOR.lang.load( editor.config.language, editor.config.defaultLanguage, function( languageCode, lang ) {
			var configTitle = editor.config.title;

			
			editor.langCode = languageCode;

			
			// As we'll be adding plugin specific entries that could come
			// from different language code files, we need a copy of lang,
			// not a direct reference to it.
			editor.lang = CKEDITOR.tools.prototypedCopy( lang );

			
			editor.title = typeof configTitle == 'string' || configTitle === false ? configTitle : [ editor.lang.editor, editor.name ].join( ', ' );

			if ( !editor.config.contentsLangDirection ) {
				// Fallback to either the editable element direction or editor UI direction depending on creators.
				editor.config.contentsLangDirection = editor.elementMode == CKEDITOR.ELEMENT_MODE_INLINE ? editor.element.getDirection( 1 ) : editor.lang.dir;
			}

			editor.fire( 'langLoaded' );

			preloadStylesSet( editor );
		} );
	}

	// Preloads styles set file (config.stylesSet).
	// If stylesSet was defined directly (by an array)
	// this function will call loadPlugins fully synchronously.
	// If stylesSet is a string (path) loadPlugins will
	// be called asynchronously.
	// In both cases - styles will be preload before plugins initialization.
	function preloadStylesSet( editor ) {
		editor.getStylesSet( function( styles ) {
			// Wait for editor#loaded, so plugins could add their listeners.
			// But listen with high priority to fire editor#stylesSet before editor#uiReady and editor#setData.
			editor.once( 'loaded', function() {
				// Note: we can't use fireOnce because this event may canceled and fired again.
				editor.fire( 'stylesSet', { styles: styles } );
			}, null, null, 1 );

			loadPlugins( editor );
		} );
	}

	function loadPlugins( editor ) {
		var config = editor.config,
			plugins = config.plugins,
			extraPlugins = config.extraPlugins,
			removePlugins = config.removePlugins;

		if ( extraPlugins ) {
			// Remove them first to avoid duplications.
			var extraRegex = new RegExp( '(?:^|,)(?:' + extraPlugins.replace( /\s*,\s*/g, '|' ) + ')(?=,|$)', 'g' );
			plugins = plugins.replace( extraRegex, '' );

			plugins += ',' + extraPlugins;
		}

		if ( removePlugins ) {
			var removeRegex = new RegExp( '(?:^|,)(?:' + removePlugins.replace( /\s*,\s*/g, '|' ) + ')(?=,|$)', 'g' );
			plugins = plugins.replace( removeRegex, '' );
		}

		// Load the Adobe AIR plugin conditionally.
		CKEDITOR.env.air && ( plugins += ',adobeair' );

		// Load all plugins defined in the "plugins" setting.
		CKEDITOR.plugins.load( plugins.split( ',' ), function( plugins ) {
			// The list of plugins.
			var pluginsArray = [];

			// The language code to get loaded for each plugin. Null
			// entries will be appended for plugins with no language files.
			var languageCodes = [];

			// The list of URLs to language files.
			var languageFiles = [];

			
			editor.plugins = plugins;

			// Loop through all plugins, to build the list of language
			// files to get loaded.
			//
			// Check also whether any of loaded plugins doesn't require plugins
			// defined in config.removePlugins. Throw non-blocking error if this happens.
			for ( var pluginName in plugins ) {
				var plugin = plugins[ pluginName ],
					pluginLangs = plugin.lang,
					lang = null,
					requires = plugin.requires,
					match, name;

				// Transform it into a string, if it's not one.
				if ( CKEDITOR.tools.isArray( requires ) )
					requires = requires.join( ',' );

				if ( requires && ( match = requires.match( removeRegex ) ) ) {
					while ( ( name = match.pop() ) ) {
						CKEDITOR.error( 'editor-plugin-required', { plugin: name.replace( ',', '' ), requiredBy: pluginName } );
					}
				}

				// If the plugin has "lang".
				if ( pluginLangs && !editor.lang[ pluginName ] ) {
					// Trasnform the plugin langs into an array, if it's not one.
					if ( pluginLangs.split )
						pluginLangs = pluginLangs.split( ',' );

					// Resolve the plugin language. If the current language
					// is not available, get English or the first one.
					if ( CKEDITOR.tools.indexOf( pluginLangs, editor.langCode ) >= 0 )
						lang = editor.langCode;
					else {
						// The language code may have the locale information (zh-cn).
						// Fall back to locale-less in that case (zh).
						var langPart = editor.langCode.replace( /-.*/, '' );
						if ( langPart != editor.langCode && CKEDITOR.tools.indexOf( pluginLangs, langPart ) >= 0 )
							lang = langPart;
						// Try the only "generic" option we have: English.
						else if ( CKEDITOR.tools.indexOf( pluginLangs, 'en' ) >= 0 )
							lang = 'en';
						else
							lang = pluginLangs[ 0 ];
					}

					if ( !plugin.langEntries || !plugin.langEntries[ lang ] ) {
						// Put the language file URL into the list of files to
						// get downloaded.
						languageFiles.push( CKEDITOR.getUrl( plugin.path + 'lang/' + lang + '.js' ) );
					} else {
						editor.lang[ pluginName ] = plugin.langEntries[ lang ];
						lang = null;
					}
				}

				// Save the language code, so we know later which
				// language has been resolved to this plugin.
				languageCodes.push( lang );

				pluginsArray.push( plugin );
			}

			// Load all plugin specific language files in a row.
			CKEDITOR.scriptLoader.load( languageFiles, function() {
				// Initialize all plugins that have the "beforeInit" and "init" methods defined.
				var methods = [ 'beforeInit', 'init', 'afterInit' ];
				for ( var m = 0; m < methods.length; m++ ) {
					for ( var i = 0; i < pluginsArray.length; i++ ) {
						var plugin = pluginsArray[ i ];

						// Uses the first loop to update the language entries also.
						if ( m === 0 && languageCodes[ i ] && plugin.lang && plugin.langEntries )
							editor.lang[ plugin.name ] = plugin.langEntries[ languageCodes[ i ] ];

						// Call the plugin method (beforeInit and init).
						if ( plugin[ methods[ m ] ] )
							plugin[ methods[ m ] ]( editor );
					}
				}

				editor.fireOnce( 'pluginsLoaded' );

				// Setup the configured keystrokes.
				config.keystrokes && editor.setKeystroke( editor.config.keystrokes );

				// Setup the configured blocked keystrokes.
				for ( i = 0; i < editor.config.blockedKeystrokes.length; i++ )
					editor.keystrokeHandler.blockedKeystrokes[ editor.config.blockedKeystrokes[ i ] ] = 1;

				editor.status = 'loaded';
				editor.fireOnce( 'loaded' );
				CKEDITOR.fire( 'instanceLoaded', null, editor );
			} );
		} );
	}

	// Send to data output back to editor's associated element.
	function updateEditorElement() {
		var element = this.element;

		// Some editor creation mode will not have the
		// associated element.
		if ( element && this.elementMode != CKEDITOR.ELEMENT_MODE_APPENDTO ) {
			var data = this.getData();

			if ( this.config.htmlEncodeOutput )
				data = CKEDITOR.tools.htmlEncode( data );

			if ( element.is( 'textarea' ) )
				element.setValue( data );
			else
				element.setHtml( data );

			return true;
		}
		return false;
	}

	// Always returns ENTER_BR in case of blockless editor.
	function validateEnterMode( editor, enterMode ) {
		return editor.blockless ? CKEDITOR.ENTER_BR : enterMode;
	}

	// Create DocumentFragment from specified ranges. For now it handles only tables in Firefox
	// and returns DocumentFragment from the 1. range for other cases. (#13884)
	function createDocumentFragmentFromRanges( ranges, editable ) {
		var docFragment = new CKEDITOR.dom.documentFragment(),
			tableClone,
			currentRow,
			currentRowClone;

		for ( var i = 0; i < ranges.length; i++ ) {
			var range = ranges[ i ],
				container = range.startContainer;

			if ( container.getName && container.getName() == 'tr' ) {
				if ( !tableClone ) {
					tableClone = container.getAscendant( 'table' ).clone();
					tableClone.append( container.getAscendant( 'tbody' ).clone() );
					docFragment.append( tableClone );
					tableClone = tableClone.findOne( 'tbody' );
				}

				if ( !( currentRow && currentRow.equals( container ) ) ) {
					currentRow = container;
					currentRowClone = container.clone();
					tableClone.append( currentRowClone );
				}

				currentRowClone.append( range.cloneContents() );
			} else {
				// If there was something else copied with table,
				// append it to DocumentFragment.
				docFragment.append( range.cloneContents() );
			}
		}

		if ( !tableClone ) {
			return editable.getHtmlFromRange( ranges[ 0 ] );
		}

		return docFragment;
	}

	CKEDITOR.tools.extend( CKEDITOR.editor.prototype, {
		
		addCommand: function( commandName, commandDefinition ) {
			commandDefinition.name = commandName.toLowerCase();
			var cmd = new CKEDITOR.command( this, commandDefinition );

			// Update command when mode is set.
			// This guarantees that commands added before first editor#mode
			// aren't immediately updated, but waits for editor#mode and that
			// commands added later are immediately refreshed, even when added
			// before instanceReady. #10103, #10249
			if ( this.mode )
				updateCommand( this, cmd );

			return this.commands[ commandName ] = cmd;
		},

		
		_attachToForm: function() {
			var editor = this,
				element = editor.element,
				form = new CKEDITOR.dom.element( element.$.form );

			// If are replacing a textarea, we must
			if ( element.is( 'textarea' ) ) {
				if ( form ) {
					form.on( 'submit', onSubmit );

					// Check if there is no element/elements input with name == "submit".
					// If they exists they will overwrite form submit function (form.$.submit).
					// If form.$.submit is overwritten we can not do anything with it.
					if ( isFunction( form.$.submit ) ) {
						// Setup the submit function because it doesn't fire the
						// "submit" event.
						form.$.submit = CKEDITOR.tools.override( form.$.submit, function( originalSubmit ) {
							return function() {
								onSubmit();

								// For IE, the DOM submit function is not a
								// function, so we need third check.
								if ( originalSubmit.apply )
									originalSubmit.apply( this );
								else
									originalSubmit();
							};
						} );
					}

					// Remove 'submit' events registered on form element before destroying.(#3988)
					editor.on( 'destroy', function() {
						form.removeListener( 'submit', onSubmit );
					} );
				}
			}

			function onSubmit( evt ) {
				editor.updateElement();

				// #8031 If textarea had required attribute and editor is empty fire 'required' event and if
				// it was cancelled, prevent submitting the form.
				if ( editor._.required && !element.getValue() && editor.fire( 'required' ) === false ) {
					// When user press save button event (evt) is undefined (see save plugin).
					// This method works because it throws error so originalSubmit won't be called.
					// Also this error won't be shown because it will be caught in save plugin.
					evt.data.preventDefault();
				}
			}

			function isFunction( f ) {
				// For IE8 typeof fun == object so we cannot use it.
				return !!( f && f.call && f.apply );
			}
		},

		
		destroy: function( noUpdate ) {
			this.fire( 'beforeDestroy' );

			!noUpdate && updateEditorElement.call( this );

			this.editable( null );

			if ( this.filter ) {
				this.filter.destroy();
				delete this.filter;
			}

			delete this.activeFilter;

			this.status = 'destroyed';

			this.fire( 'destroy' );

			// Plug off all listeners to prevent any further events firing.
			this.removeAllListeners();

			CKEDITOR.remove( this );
			CKEDITOR.fire( 'instanceDestroyed', null, this );
		},

		
		elementPath: function( startNode ) {
			if ( !startNode ) {
				var sel = this.getSelection();
				if ( !sel )
					return null;

				startNode = sel.getStartElement();
			}

			return startNode ? new CKEDITOR.dom.elementPath( startNode, this.editable() ) : null;
		},

		
		createRange: function() {
			var editable = this.editable();
			return editable ? new CKEDITOR.dom.range( editable ) : null;
		},

		
		execCommand: function( commandName, data ) {
			var command = this.getCommand( commandName );

			var eventData = {
				name: commandName,
				commandData: data,
				command: command
			};

			if ( command && command.state != CKEDITOR.TRISTATE_DISABLED ) {
				if ( this.fire( 'beforeCommandExec', eventData ) !== false ) {
					eventData.returnValue = command.exec( eventData.commandData );

					// Fire the 'afterCommandExec' immediately if command is synchronous.
					if ( !command.async && this.fire( 'afterCommandExec', eventData ) !== false )
						return eventData.returnValue;
				}
			}

			// throw 'Unknown command name "' + commandName + '"';
			return false;
		},

		
		getCommand: function( commandName ) {
			return this.commands[ commandName ];
		},

		
		getData: function( internal ) {
			!internal && this.fire( 'beforeGetData' );

			var eventData = this._.data;

			if ( typeof eventData != 'string' ) {
				var element = this.element;
				if ( element && this.elementMode == CKEDITOR.ELEMENT_MODE_REPLACE )
					eventData = element.is( 'textarea' ) ? element.getValue() : element.getHtml();
				else
					eventData = '';
			}

			eventData = { dataValue: eventData };

			// Fire "getData" so data manipulation may happen.
			!internal && this.fire( 'getData', eventData );

			return eventData.dataValue;
		},

		
		getSnapshot: function() {
			var data = this.fire( 'getSnapshot' );

			if ( typeof data != 'string' ) {
				var element = this.element;

				if ( element && this.elementMode == CKEDITOR.ELEMENT_MODE_REPLACE ) {
					data = element.is( 'textarea' ) ? element.getValue() : element.getHtml();
				}
				else {
					// If we don't have a proper element, set data to an empty string,
					// as this method is expected to return a string. (#13385)
					data = '';
				}
			}

			return data;
		},

		
		loadSnapshot: function( snapshot ) {
			this.fire( 'loadSnapshot', snapshot );
		},

		
		setData: function( data, options, internal ) {
			var fireSnapshot = true,
				// Backward compatibility.
				callback = options,
				eventData;

			if ( options && typeof options == 'object' ) {
				internal = options.internal;
				callback = options.callback;
				fireSnapshot = !options.noSnapshot;
			}

			if ( !internal && fireSnapshot )
				this.fire( 'saveSnapshot' );

			if ( callback || !internal ) {
				this.once( 'dataReady', function( evt ) {
					if ( !internal && fireSnapshot )
						this.fire( 'saveSnapshot' );

					if ( callback )
						callback.call( evt.editor );
				} );
			}

			// Fire "setData" so data manipulation may happen.
			eventData = { dataValue: data };
			!internal && this.fire( 'setData', eventData );

			this._.data = eventData.dataValue;

			!internal && this.fire( 'afterSetData', eventData );
		},

		
		setReadOnly: function( isReadOnly ) {
			isReadOnly = ( isReadOnly == null ) || isReadOnly;

			if ( this.readOnly != isReadOnly ) {
				this.readOnly = isReadOnly;

				// Block or release BACKSPACE key according to current read-only
				// state to prevent browser's history navigation (#9761).
				this.keystrokeHandler.blockedKeystrokes[ 8 ] = +isReadOnly;

				this.editable().setReadOnly( isReadOnly );

				// Fire the readOnly event so the editor features can update
				// their state accordingly.
				this.fire( 'readOnly' );
			}
		},

		
		insertHtml: function( html, mode, range ) {
			this.fire( 'insertHtml', { dataValue: html, mode: mode, range: range } );
		},

		
		insertText: function( text ) {
			this.fire( 'insertText', text );
		},

		
		insertElement: function( element ) {
			this.fire( 'insertElement', element );
		},

		
		getSelectedHtml: function( toString ) {
			var editable = this.editable(),
				selection = this.getSelection(),
				ranges = selection && selection.getRanges();

			if ( !editable || !ranges || ranges.length === 0 ) {
				return null;
			}

			var docFragment = createDocumentFragmentFromRanges( ranges, editable );

			return toString ? docFragment.getHtml() : docFragment;
		},

		
		extractSelectedHtml: function( toString, removeEmptyBlock ) {
			var editable = this.editable(),
				ranges = this.getSelection().getRanges();

			if ( !editable || ranges.length === 0 ) {
				return null;
			}

			var range = ranges[ 0 ],
				docFragment = editable.extractHtmlFromRange( range, removeEmptyBlock );

			if ( !removeEmptyBlock ) {
				this.getSelection().selectRanges( [ range ] );
			}

			return toString ? docFragment.getHtml() : docFragment;
		},

		
		focus: function() {
			this.fire( 'beforeFocus' );
		},

		
		checkDirty: function() {
			return this.status == 'ready' && this._.previousValue !== this.getSnapshot();
		},

		
		resetDirty: function() {
			this._.previousValue = this.getSnapshot();
		},

		
		updateElement: function() {
			return updateEditorElement.call( this );
		},

		
		setKeystroke: function() {
			var keystrokes = this.keystrokeHandler.keystrokes,
				newKeystrokes = CKEDITOR.tools.isArray( arguments[ 0 ] ) ? arguments[ 0 ] : [ [].slice.call( arguments, 0 ) ],
				keystroke, behavior;

			for ( var i = newKeystrokes.length; i--; ) {
				keystroke = newKeystrokes[ i ];
				behavior = 0;

				// It may be a pair of: [ key, command ]
				if ( CKEDITOR.tools.isArray( keystroke ) ) {
					behavior = keystroke[ 1 ];
					keystroke = keystroke[ 0 ];
				}

				if ( behavior )
					keystrokes[ keystroke ] = behavior;
				else
					delete keystrokes[ keystroke ];
			}
		},

		
		addFeature: function( feature ) {
			return this.filter.addFeature( feature );
		},

		
		setActiveFilter: function( filter ) {
			if ( !filter )
				filter = this.filter;

			if ( this.activeFilter !== filter ) {
				this.activeFilter = filter;
				this.fire( 'activeFilterChange' );

				// Reset active filter to the main one - it resets enter modes, too.
				if ( filter === this.filter )
					this.setActiveEnterMode( null, null );
				else
					this.setActiveEnterMode(
						filter.getAllowedEnterMode( this.enterMode ),
						filter.getAllowedEnterMode( this.shiftEnterMode, true )
					);
			}
		},

		
		setActiveEnterMode: function( enterMode, shiftEnterMode ) {
			// Validate passed modes or use default ones (validated on init).
			enterMode = enterMode ? validateEnterMode( this, enterMode ) : this.enterMode;
			shiftEnterMode = shiftEnterMode ? validateEnterMode( this, shiftEnterMode ) : this.shiftEnterMode;

			if ( this.activeEnterMode != enterMode || this.activeShiftEnterMode != shiftEnterMode ) {
				this.activeEnterMode = enterMode;
				this.activeShiftEnterMode = shiftEnterMode;
				this.fire( 'activeEnterModeChange' );
			}
		},

		
		showNotification: function( message ) {
			alert( message ); // jshint ignore:line
		}
	} );
} )();


CKEDITOR.ELEMENT_MODE_NONE = 0;


CKEDITOR.ELEMENT_MODE_REPLACE = 1;


CKEDITOR.ELEMENT_MODE_APPENDTO = 2;


CKEDITOR.ELEMENT_MODE_INLINE = 3;







 




















































































