



( function() {
	'use strict';

	CKEDITOR.plugins.add( 'notificationaggregator', {
		requires: 'notification'
	} );

	
	function Aggregator( editor, message, singularMessage ) {
		
		this.editor = editor;

		
		this.notification = null;

		
		this._message = new CKEDITOR.template( message );

		
		this._singularMessage = singularMessage ? new CKEDITOR.template( singularMessage ) : null;

		// Set the _tasks, _totalWeights, _doneWeights, _doneTasks properties.
		this._tasks = [];
		this._totalWeights = 0;
		this._doneWeights = 0;
		this._doneTasks = 0;

		

		

		

		
	}

	Aggregator.prototype = {
		
		createTask: function( options ) {
			options = options || {};

			var initialTask = !this.notification,
				task;

			if ( initialTask ) {
				// It's a first call.
				this.notification = this._createNotification();
			}

			task = this._addTask( options );

			task.on( 'updated', this._onTaskUpdate, this );
			task.on( 'done', this._onTaskDone, this );
			task.on( 'canceled', function() {
				this._removeTask( task );
			}, this );

			// Update the aggregator.
			this.update();

			if ( initialTask ) {
				this.notification.show();
			}

			return task;
		},

		
		update: function() {
			this._updateNotification();

			if ( this.isFinished() ) {
				this.fire( 'finished' );
			}
		},

		
		getPercentage: function() {
			// In case there are no weights at all we'll return 1.
			if ( this.getTaskCount() === 0 ) {
				return 1;
			}

			return this._doneWeights / this._totalWeights;
		},

		
		isFinished: function() {
			return this.getDoneTaskCount() === this.getTaskCount();
		},

		
		getTaskCount: function() {
			return this._tasks.length;
		},

		
		getDoneTaskCount: function() {
			return this._doneTasks;
		},

		
		_updateNotification: function() {
			this.notification.update( {
				message: this._getNotificationMessage(),
				progress: this.getPercentage()
			} );
		},

		
		_getNotificationMessage: function() {
			var tasksCount = this.getTaskCount(),
				doneTasks = this.getDoneTaskCount(),
				templateParams = {
					current: doneTasks,
					max: tasksCount,
					percentage: Math.round( this.getPercentage() * 100 )
				},
				template;

			// If there's only one remaining task and we have a singular message, we should use it.
			if ( tasksCount == 1 && this._singularMessage ) {
				template = this._singularMessage;
			} else {
				template = this._message;
			}

			return template.output( templateParams );
		},

		
		_createNotification: function() {
			return new CKEDITOR.plugins.notification( this.editor, {
				type: 'progress'
			} );
		},

		
		_addTask: function( options ) {
			var task = new Task( options.weight );
			this._tasks.push( task );
			this._totalWeights += task._weight;
			return task;
		},

		
		_removeTask: function( task ) {
			var index = CKEDITOR.tools.indexOf( this._tasks, task );

			if ( index !== -1 ) {
				// If task was already updated with some weight, we need to remove
				// this weight from our cache.
				if ( task._doneWeight ) {
					this._doneWeights -= task._doneWeight;
				}

				this._totalWeights -= task._weight;

				this._tasks.splice( index, 1 );
				// And we also should inform the UI about this change.
				this.update();
			}
		},

		
		_onTaskUpdate: function( evt ) {
			this._doneWeights += evt.data;
			this.update();
		},

		
		_onTaskDone: function() {
			this._doneTasks += 1;
			this.update();
		}
	};

	CKEDITOR.event.implementOn( Aggregator.prototype );

	
	function Task( weight ) {
		
		this._weight = weight || 1;

		
		this._doneWeight = 0;

		
		this._isCanceled = false;
	}

	Task.prototype = {
		
		done: function() {
			this.update( this._weight );
		},

		
		update: function( weight ) {
			// If task is already done or canceled there is no need to update it, and we don't expect
			// progress to be reversed.
			if ( this.isDone() || this.isCanceled() ) {
				return;
			}

			// Note that newWeight can't be higher than _doneWeight.
			var newWeight = Math.min( this._weight, weight ),
				weightChange = newWeight - this._doneWeight;

			this._doneWeight = newWeight;

			// Fire updated event even if task is done in order to correctly trigger updating the
			// notification's message. If we wouldn't do this, then the last weight change would be ignored.
			this.fire( 'updated', weightChange );

			if ( this.isDone() ) {
				this.fire( 'done' );
			}
		},

		
		cancel: function() {
			// If task is already done or canceled.
			if ( this.isDone() || this.isCanceled() ) {
				return;
			}

			// Mark task as canceled.
			this._isCanceled = true;

			// We'll fire cancel event it's up to aggregator to listen for this event,
			// and remove the task.
			this.fire( 'canceled' );
		},

		
		isDone: function() {
			return this._weight === this._doneWeight;
		},

		
		isCanceled: function() {
			return this._isCanceled;
		}
	};

	CKEDITOR.event.implementOn( Task.prototype );

	

	

	

	

	// Expose Aggregator type.
	CKEDITOR.plugins.notificationAggregator = Aggregator;
	CKEDITOR.plugins.notificationAggregator.task = Task;
} )();
