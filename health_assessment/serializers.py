from rest_framework import serializers
from .models import HealthAssessment, Question, Answer, TreatmentPlan

class AnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Answer
        fields = ['answer_text', 'created_at']

class QuestionSerializer(serializers.ModelSerializer):
    answer = AnswerSerializer(read_only=True)
    
    class Meta:
        model = Question
        fields = ['id', 'question_text', 'question_order', 'is_answered', 'answer']

class TreatmentPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = TreatmentPlan
        fields = ['diagnosis', 'recommendations', 'medications', 'lifestyle_changes', 'followup_instructions', 'created_at']

class HealthAssessmentSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    treatment_plan = TreatmentPlanSerializer(read_only=True)
    
    class Meta:
        model = HealthAssessment
        fields = ['id', 'session_id', 'initial_concern', 'status', 'questions', 'treatment_plan', 'created_at', 'updated_at']

class StartAssessmentSerializer(serializers.Serializer):
    initial_concern = serializers.CharField(max_length=2000)
    session_id = serializers.CharField(max_length=100, required=False)

class SubmitAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    answer_text = serializers.CharField(max_length=2000)
